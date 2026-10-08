/**
 * Web Worker for isolated Gleam/JavaScript code execution
 * This worker runs with explicit Deno permissions to support file system operations
 */

import { EXIT_SIGNAL_PREFIX, EXIT_TRAP_GLOBAL, parseExitStatus } from "../stdlib/process_shim.ts";

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
  /** Status the program asked for when it ended by calling exit. */
  exitCode?: number;
}

/**
 * Thrown when the program asks to exit, unwinding it inside the worker.
 *
 * The message carries the status so the same marker works for the shim, which
 * lives in the temporary tree and cannot share this module's error class.
 */
class ProgramExit extends Error {
  constructor(status: number) {
    super(`${EXIT_SIGNAL_PREFIX}${status}`);
    this.name = "ProgramExit";
  }
}

/**
 * Route program-initiated exits back to the host.
 *
 * `exit` from `node:process` ends a Deno worker silently: the host never gets a
 * result, so the run hangs until the timeout and whatever the program printed
 * is discarded. The FFI rewrite points `node:process` at the shim, whose exit
 * calls the trap below, and `Deno.exit` is replaced for programs that reach it
 * directly. The trap throws instead of exiting, so the worker survives and
 * reports a result.
 *
 * @returns the trap, for callers that want to hand it to the program.
 */
function installExitTrap(): (status?: number) => never {
  const requestExit = (status?: number): never => {
    throw new ProgramExit(status ?? 0);
  };

  (globalThis as Record<string, unknown>)[EXIT_TRAP_GLOBAL] = requestExit;
  (Deno as unknown as { exit: (status?: number) => never }).exit = requestExit;

  return requestExit;
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

    // A program that calls exit must not take the worker down with it: the
    // trap turns that call into a catchable error reported as a result.
    const requestExit = installExitTrap();

    // Expose command-line arguments to the program. Gleam CLIs (e.g. sqlode)
    // go through `argv`, whose JS FFI reads `process.argv` before `Deno.args`;
    // a worker's `Deno.args` is fixed and cannot be assigned, so a minimal
    // `process` shim is what actually reaches the program.
    if (args) {
      const program = programPath ?? `${moduleName}.mjs`;
      (globalThis as { process?: { argv: string[]; exit?: (code?: number) => never } }).process = {
        argv: ["deno", program, ...args],
        exit: requestExit,
      };
    }

    // Execute the module using dynamic import
    let exitCode = 0;
    try {
      const module = await import(`file://${tempFile}`);
      if (module.main) {
        await module.main();
      }
    } catch (error) {
      const status = parseExitStatus(error);
      if (status === undefined) throw error;
      exitCode = status;
    }

    const response: WorkerResponse = {
      type: "result",
      success: exitCode === 0,
      exitCode,
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
