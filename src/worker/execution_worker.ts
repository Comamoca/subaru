/**
 * Web Worker for isolated Gleam/JavaScript code execution
 * This worker runs with explicit Deno permissions to support file system operations
 */

// Message types for communication
export interface WorkerMessage {
  type: "execute";
  payload: {
    jsCode: string;
    moduleName: string;
    tempDir: string;
    moduleStubs: {
      gleam: string;
      gleamIo: string;
      gleamString: string;
    };
    // All compiled JavaScript modules (module name -> JS code)
    compiledModules?: Record<string, string>;
    // FFI JavaScript files (path -> content)
    ffiFiles?: Record<string, string>;
  };
}

export interface WorkerResponse {
  type: "result" | "error" | "output";
  success?: boolean;
  output?: string[];
  error?: string;
  line?: string;
}

const workerSelf = self as unknown as Worker;

// Worker entry point
workerSelf.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  if (type === "execute") {
    await executeModule(payload);
  }
};

async function executeModule(
  payload: WorkerMessage["payload"],
): Promise<void> {
  const { jsCode, moduleName, tempDir, moduleStubs, compiledModules, ffiFiles } = payload;

  try {
    // Create directory structure
    await Deno.mkdir(`${tempDir}/gleam`, { recursive: true });

    // Write gleam.mjs stub (base Gleam runtime types)
    await Deno.writeTextFile(`${tempDir}/gleam.mjs`, moduleStubs.gleam);

    // Write gleam_stdlib.mjs using the postMessage-based IO stub from runner
    await Deno.writeTextFile(`${tempDir}/gleam_stdlib.mjs`, moduleStubs.gleamIo);

    // Write all compiled modules from the compilation FIRST
    // These are the actual compiled JavaScript from Gleam
    if (compiledModules) {
      for (const [modName, modCode] of Object.entries(compiledModules)) {
        // Skip the main module (will be written below)
        if (modName === moduleName) continue;

        // Create directory structure for nested modules (e.g., gleam/list -> gleam/)
        const modPath = `${tempDir}/${modName}.mjs`;
        const modDir = modPath.substring(0, modPath.lastIndexOf("/"));
        if (modDir !== tempDir) {
          await Deno.mkdir(modDir, { recursive: true });
        }

        await Deno.writeTextFile(modPath, modCode);
      }
    }

    // Write FFI files (JavaScript files that come with packages like simplifile)
    if (ffiFiles) {
      for (const [ffiPath, ffiContent] of Object.entries(ffiFiles)) {
        // FFI files are stored with their relative path (e.g., "filepath_ffi.mjs", "simplifile_ffi.mjs")
        const fullPath = `${tempDir}/${ffiPath}`;
        const ffiDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (ffiDir !== tempDir && ffiDir.length > 0) {
          await Deno.mkdir(ffiDir, { recursive: true });
        }
        await Deno.writeTextFile(fullPath, ffiContent);
      }
    }

    // Write the main module
    const tempFile = `${tempDir}/${moduleName}.mjs`;
    await Deno.writeTextFile(tempFile, jsCode);

    // Execute the module using dynamic import
    const module = await import(`file://${tempFile}`);
    if (module.main) {
      await module.main();
    }

    // Send success result (output was streamed via postMessage during execution)
    const response: WorkerResponse = {
      type: "result",
      success: true,
      output: [],
    };
    workerSelf.postMessage(response);
  } catch (error) {
    // Send error result
    const response: WorkerResponse = {
      type: "error",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    workerSelf.postMessage(response);
  }
}
