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
    // Arguments to expose to the running program as command-line args.
    args?: string[];
    // Path shown as the program name (argv[1]).
    programPath?: string;
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

/**
 * Whether this module is running inside a dedicated worker.
 *
 * It is imported for its side effect from `gleam_runner.ts` so `deno compile`
 * bundles it into the executable; that same import also evaluates the module
 * on the main thread, where there is no `onmessage` to serve. The guard keeps
 * the entry inert there.
 */
function isDedicatedWorker(): boolean {
  return typeof self !== "undefined" && !("window" in self) &&
    typeof (self as { postMessage?: unknown }).postMessage === "function";
}

// Worker entry point
if (isDedicatedWorker()) {
  workerSelf.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;

    if (type === "execute") {
      await executeModule(payload);
    }
  };
}

async function executeModule(
  payload: WorkerMessage["payload"],
): Promise<void> {
  const { jsCode, moduleName, tempDir, moduleStubs, compiledModules, ffiFiles, args, programPath } =
    payload;

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
      workerSelf.postMessage({ type: "output", line: args.map(String).join(" ") });
    };
    console.error = (...args: unknown[]) => {
      workerSelf.postMessage({ type: "output", line: args.map(String).join(" ") });
    };

    // Write the main module
    const tempFile = `${tempDir}/${moduleName}.mjs`;
    await Deno.writeTextFile(tempFile, jsCode);

    // Expose command-line arguments to the program. Gleam CLIs (e.g. sqlode)
    // go through `argv`, whose JS FFI reads `process.argv` before `Deno.args`;
    // a worker's `Deno.args` is fixed and cannot be assigned, so a minimal
    // `process` shim is what actually reaches the program.
    if (args) {
      const program = programPath ?? `${moduleName}.mjs`;
      (globalThis as { process?: { argv: string[] } }).process = {
        argv: ["deno", program, ...args],
      };
    }

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
