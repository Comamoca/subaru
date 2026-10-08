/**
 * `node:process` shim for executed programs
 *
 * Gleam CLIs terminate by calling `exit` from `node:process`. Inside a Deno
 * worker that call tears the worker down without telling the host: the run
 * hangs until the timeout and the output captured so far is thrown away. FFI
 * files and compiled modules that import `node:process` are redirected to this
 * shim, whose `exit` hands the status to the worker's trap and unwinds the
 * program instead of killing the worker.
 *
 * Everything else the module exports (`argv`, `cwd`, `env`, the default
 * export) is re-exported unchanged, so a shimmed import stays a drop-in
 * replacement.
 */

/** Package directory the shim is written under, inside the FFI tree. */
export const PROCESS_SHIM_PACKAGE = "_subaru";

/** File name of the shim inside its package directory. */
export const PROCESS_SHIM_FILE = "process.mjs";

/**
 * Global the worker installs to receive exit requests from the shim.
 *
 * The shim is a plain JavaScript module in the temporary tree, so it cannot
 * import the worker's own code; it reaches the trap through globalThis.
 */
export const EXIT_TRAP_GLOBAL = "__subaruExit";

/**
 * Prefix the exit path uses for the error that unwinds the program.
 *
 * The worker catches it by message so the same marker works both for the shim
 * (which cannot share the worker's error class) and for a program that calls
 * `Deno.exit` directly.
 */
export const EXIT_SIGNAL_PREFIX = "SubaruExitSignal:";

/** Whether a specifier asks for Node's process module. */
export function isProcessSpecifier(specifier: string): boolean {
  return specifier === "node:process" || specifier === "process";
}

/**
 * The exit status carried by an error thrown by the exit path, or undefined
 * for any other error.
 */
export function parseExitStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  if (!error.message.startsWith(EXIT_SIGNAL_PREFIX)) return undefined;

  const status = Number(error.message.slice(EXIT_SIGNAL_PREFIX.length));
  return Number.isFinite(status) ? status : undefined;
}

/**
 * Source of the shim as it is written into the temporary tree.
 *
 * The explicit `exit` export wins over the `export *` re-export, so callers
 * get the trapped version while every other named export (and the default
 * export) keeps coming from `node:process`.
 */
export const PROCESS_SHIM_SOURCE = `export * from "node:process";
export { default } from "node:process";

/**
 * Exit through subaru's trap so the host receives the program's status
 * instead of losing the worker that ran it.
 */
export function exit(code) {
  const status = code === undefined ? 0 : code;
  const trap = globalThis.${EXIT_TRAP_GLOBAL};
  if (typeof trap === "function") {
    trap(status);
  }
  throw new Error("${EXIT_SIGNAL_PREFIX}" + status);
}
`;
