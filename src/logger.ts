export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

const WASM_PREFIXES = ["TRACE ", "DEBUG ", "INFO ", "compiler-"];

function isWasmInternalLog(message: string): boolean {
  return WASM_PREFIXES.some((prefix) => message.includes(prefix));
}

export class Logger {
  constructor(private level: LogLevel) {}

  log(...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[this.level] >= LOG_LEVEL_ORDER["info"]) {
      console.log(...args);
    } else if (!isWasmInternalLog(args.join(" "))) {
      console.log(...args);
    }
  }

  warn(...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[this.level] >= LOG_LEVEL_ORDER["warn"]) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[this.level] >= LOG_LEVEL_ORDER["error"]) {
      console.error(...args);
    }
  }

  info(...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[this.level] >= LOG_LEVEL_ORDER["info"]) {
      console.info(...args);
    }
  }

  debug(...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[this.level] >= LOG_LEVEL_ORDER["debug"]) {
      console.debug(...args);
    }
  }
}
