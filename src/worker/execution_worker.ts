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

// Global output array to collect println calls
const capturedOutput: string[] = [];

// Worker entry point
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  if (type === "execute") {
    await executeModule(payload);
  }
};

async function executeModule(
  payload: WorkerMessage["payload"],
): Promise<void> {
  const { jsCode, moduleName, tempDir, moduleStubs, compiledModules, ffiFiles } = payload;
  capturedOutput.length = 0; // Clear previous output
  const outputFile = `${tempDir}/output.txt`;

  try {
    // Create directory structure
    await Deno.mkdir(`${tempDir}/gleam`, { recursive: true });

    // Write gleam.mjs stub (base Gleam runtime types)
    await Deno.writeTextFile(`${tempDir}/gleam.mjs`, moduleStubs.gleam);

    // Write gleam_stdlib.mjs (Gleam runtime FFI functions)
    // This file is imported by compiled Gleam modules for IO and other operations
    const gleamStdlibStub = `
// Gleam standard library JavaScript FFI
// Output capture injected by Subaru worker
const __outputPath = "${outputFile.replace(/\\/g, "/")}";

function __captureOutput(msg) {
  const line = String(msg);
  Deno.writeTextFileSync(__outputPath, line + "\\n", { append: true });
}

export function print(string) {
  __captureOutput(string);
}

export function print_error(string) {
  __captureOutput("[ERROR] " + string);
}

export function console_log(string) {
  __captureOutput(string);
}

export function console_error(string) {
  __captureOutput("[ERROR] " + string);
}

// Additional Gleam prelude exports
export function identity(x) { return x; }

export function inspect(value) {
  if (value === null) return "Nil";
  if (value === undefined) return "Nil";
  if (typeof value === "string") return '"' + value + '"';
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) return "[" + value.map(inspect).join(", ") + "]";
  if (value.constructor && value.constructor.name) {
    return value.constructor.name;
  }
  return String(value);
}

// Result type constructors
export class Ok {
  constructor(value) { this[0] = value; }
}

export class Error {
  constructor(value) { this[0] = value; }
}

// Option type constructors
export class Some {
  constructor(value) { this[0] = value; }
}

export class None {}

// List operations
export function toList(array) {
  let list = { atLeastLength: () => false, hasLength: (n) => n === 0 };
  for (let i = array.length - 1; i >= 0; i--) {
    list = { head: array[i], tail: list, atLeastLength: (n) => n <= array.length, hasLength: (n) => n === array.length };
  }
  return list;
}

export function prepend(item, list) {
  return { head: item, tail: list };
}

// String operations
export function string_length(string) {
  return string.length;
}

export function concat(strings) {
  return strings.join("");
}

// Comparison
export function isEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => isEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => isEqual(a[k], b[k]));
  }
  return false;
}

// Bit arrays
export class BitArray {
  constructor(buffer) {
    this.buffer = buffer;
    this.length = buffer.length;
  }
}

export function toBitArray(segments) {
  return new BitArray(new Uint8Array(segments));
}

// UTF codepoints
export class UtfCodepoint {
  constructor(value) { this.value = value; }
}

export function utf_codepoint(value) {
  return new UtfCodepoint(value);
}

// Custom type base
export class CustomType {}

// Remainder operations
export function remainderInt(a, b) {
  return a % b;
}

export function divideInt(a, b) {
  return Math.trunc(a / b);
}

export function divideFloat(a, b) {
  return a / b;
}
`;
    await Deno.writeTextFile(`${tempDir}/gleam_stdlib.mjs`, gleamStdlibStub);

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

    // Read captured output from file
    const output: string[] = [];
    try {
      const fileOutput = await Deno.readTextFile(outputFile);
      const lines = fileOutput.trim().split("\n").filter((line) => line.length > 0);
      output.push(...lines);
    } catch {
      // No output file means no println calls
    }

    // Send success result
    const response: WorkerResponse = {
      type: "result",
      success: true,
      output,
    };
    self.postMessage(response);
  } catch (error) {
    // Send error result
    const response: WorkerResponse = {
      type: "error",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
}
