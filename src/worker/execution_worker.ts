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

    // Write all compiled modules from the compilation
    if (compiledModules) {
      for (const [modName, modCode] of Object.entries(compiledModules)) {
        if (modName === moduleName) continue;

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
        const fullPath = `${tempDir}/${ffiPath}`;
        const ffiDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (ffiDir !== tempDir && ffiDir.length > 0) {
          await Deno.mkdir(ffiDir, { recursive: true });
        }
        await Deno.writeTextFile(fullPath, ffiContent);
      }
    }

    // Write stubs LAST so they take precedence over FFI files for gleam_stdlib.mjs.
    // The stubs use postMessage for output capture; the real FFI uses console.log
    // which does not get captured by the worker's message handler.
    if (!compiledModules || !("gleam" in compiledModules)) {
      await Deno.writeTextFile(`${tempDir}/gleam.mjs`, moduleStubs.gleam);
    }
    if (!compiledModules || !("gleam_stdlib" in compiledModules)) {
      await Deno.writeTextFile(`${tempDir}/gleam_stdlib.mjs`, moduleStubs.gleamIo);
    }

    // Write the main module
    const tempFile = `${tempDir}/${moduleName}.mjs`;
    await Deno.writeTextFile(tempFile, jsCode);

    // Execute the module using dynamic import
    const module = await import(`file://${tempFile}`);
    if (module.main) {
      await module.main();
    }

    const response: WorkerResponse = {
      type: "result",
      success: true,
      output: undefined as unknown as string[],
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
