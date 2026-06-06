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

    // Write stubs for modules the compiler didn't produce
    if (!compiledModules || !("gleam" in compiledModules)) {
      await Deno.writeTextFile(`${tempDir}/gleam.mjs`, moduleStubs.gleam);
    }
    if (!compiledModules || !("gleam_stdlib" in compiledModules)) {
      await Deno.writeTextFile(`${tempDir}/gleam_stdlib.mjs`, moduleStubs.gleamIo);
    }

    // Write FFI files LAST so they take precedence over stubs.
    // FFI files contain ALL function implementations compiled modules need.
    // Console output is captured via the console override below.
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

    // Override console.log/error to use postMessage for output capture
    // This ensures FFI files that use console.log also get captured
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => {
      self.postMessage({ type: "output", line: args.map(String).join(" ") });
    };
    console.error = (...args: unknown[]) => {
      self.postMessage({ type: "output", line: args.map(String).join(" ") });
    };

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
