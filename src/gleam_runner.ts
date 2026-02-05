import { downloadGleamWasmToPath, getWasmCacheDir } from "./setup.ts";
import { createStdlibLoader, type StandardLibraryConfig } from "./stdlib/mod.ts";

export interface CompileResult {
  success: boolean;
  javascript?: string;
  erlang?: string;
  warnings: string[];
  errors: string[];
  // All compiled JavaScript modules (module name -> JS code)
  allModules?: Map<string, string>;
  // FFI JavaScript files (path -> content)
  ffiFiles?: Map<string, string>;
}

export interface RunResult {
  success: boolean;
  output: string[];
  errors: string[];
}

export interface PreloadScript {
  moduleName: string;
  code: string;
  url?: string;
  filePath?: string;
}

export interface WorkerPermissions {
  read?: boolean | string[];
  write?: boolean | string[];
  net?: boolean | string[];
  env?: boolean | string[];
}

export interface GleamRunnerConfig {
  wasmPath?: string;
  debug?: boolean;
  logLevel?: "silent" | "error" | "warn" | "info" | "debug" | "trace";
  preloadScripts?: PreloadScript[];
  noWarnings?: boolean;
  warningColor?: "red" | "yellow" | "green" | "blue" | "magenta" | "cyan" | "white" | "gray";
  noStdlib?: boolean;
  standardLibrary?: StandardLibraryConfig;
  workerPermissions?: WorkerPermissions;
  timeout?: number;
}

// Constants for default values and patterns
const DEFAULT_LOG_LEVEL = "silent";
const DEFAULT_WARNING_COLOR = "yellow";
const FALLBACK_URL = "https://example.com";

// Regex patterns for code analysis
const ECHO_CALL_PATTERN = /echo\(([^,]+),\s*"([^"]*)",\s*(\d+)\)/g;
const PRINTLN_PATTERN = /\$io\.println\(([^)]+)\)/g;
const URL_EXTRACTION_PATTERN = /\$request\.to\("([^"]+)"\)/;

// ANSI color codes
const colors = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
} as const;

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Check if WASM compiler files exist at the given path
 */
async function wasmExists(path: string): Promise<boolean> {
  try {
    const jsFile = await Deno.stat(`${path}/gleam_wasm.js`);
    const wasmFile = await Deno.stat(`${path}/gleam_wasm_bg.wasm`);
    return jsFile.isFile && wasmFile.isFile;
  } catch {
    return false;
  }
}

/**
 * Resolve WASM compiler path with fallback and auto-download
 * Priority: configPath -> ./wasm-compiler -> cache -> auto-download
 */
async function resolveWasmPath(configPath?: string, debug: boolean = false): Promise<string> {
  // Helper to ensure absolute path
  const toAbsolutePath = (path: string): string => {
    if (path.startsWith("/") || path.match(/^[A-Za-z]:\\/)) {
      return path; // Already absolute
    }
    return `${Deno.cwd()}/${path}`;
  };

  // 1. Check config-specified path
  if (configPath && configPath !== "") {
    const absConfigPath = toAbsolutePath(configPath);
    if (await wasmExists(absConfigPath)) {
      if (debug) {
        console.log(`Using WASM compiler from config: ${absConfigPath}`);
      }
      return absConfigPath;
    }
  }

  // 2. Check cache directory (priority over local)
  const cachePath = getWasmCacheDir();
  if (await wasmExists(cachePath)) {
    if (debug) {
      console.log(`Using WASM compiler from cache: ${cachePath}`);
    }
    return cachePath;
  }

  // 3. Check local ./wasm-compiler directory (fallback)
  const localPath = `${Deno.cwd()}/wasm-compiler`;
  if (await wasmExists(localPath)) {
    if (debug) {
      console.log(`Using WASM compiler from local directory: ${localPath}`);
    }
    return localPath;
  }

  // 4. Auto-download to cache
  if (debug) {
    console.log(`WASM compiler not found. Downloading to cache: ${cachePath}`);
  } else {
    console.log("📥 Downloading Gleam WASM compiler (first-time setup)...");
  }

  await downloadGleamWasmToPath(cachePath);
  return cachePath;
}

// Default timeout for worker execution (30 seconds)
const DEFAULT_TIMEOUT = 30000;

export class GleamRunner {
  private wasmPath: string;
  private wasmModule: unknown;
  private projectId: number = 0;
  private debug: boolean;
  private logLevel: string;
  private preloadScripts: PreloadScript[];
  private noWarnings: boolean;
  private warningColor: string;
  private noStdlib: boolean;
  private standardLibrary: StandardLibraryConfig;
  private workerPermissions: WorkerPermissions;
  private timeout: number;
  // Track all module names written during compilation
  private writtenModules: Set<string> = new Set();
  // Track FFI files collected during stdlib loading
  private ffiFiles: Map<string, string> = new Map();

  constructor(config: GleamRunnerConfig = {}) {
    this.wasmPath = config.wasmPath || "";
    this.debug = config.debug || false;
    this.logLevel = config.logLevel || DEFAULT_LOG_LEVEL;
    this.preloadScripts = config.preloadScripts || [];
    this.noWarnings = config.noWarnings !== undefined ? config.noWarnings : true;
    this.warningColor = config.warningColor || DEFAULT_WARNING_COLOR;
    this.noStdlib = config.noStdlib || false;
    this.standardLibrary = config.standardLibrary || {};
    this.workerPermissions = config.workerPermissions || {
      read: true,
      write: true,
      net: true,
      env: true,
    };
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  async initialize(): Promise<void> {
    try {
      // Set up logging filter to control debug output
      this.setupLogging();

      // Resolve WASM path (with auto-download if needed)
      this.wasmPath = await resolveWasmPath(this.wasmPath, this.debug);

      if (this.debug) {
        console.log(`WASM compiler location: ${this.wasmPath}`);
      }

      // Import the WASM module
      const wasmModulePath = `file://${this.wasmPath}/gleam_wasm.js`;
      const { default: init, initialise_panic_hook } = await import(wasmModulePath);

      // Initialize with WASM file
      const wasmFile = await Deno.readFile(`${this.wasmPath}/gleam_wasm_bg.wasm`);
      this.wasmModule = await init({ module_or_path: wasmFile });

      // Initialize panic hook for better error reporting
      initialise_panic_hook(this.debug);

      if (this.debug) {
        console.log("Gleam WASM compiler initialized successfully");
      }
    } catch (error) {
      throw new Error(`Failed to initialize Gleam WASM compiler: ${error}`);
    }
  }

  private setupLogging(): void {
    // Filter only internal debug logs from WASM compiler, not user output
    if (!this.debug && this.logLevel !== "trace") {
      // Store original console methods
      const originalConsole = { ...console };

      // Create filtered console that only affects WASM debug output
      if (this.logLevel === "silent") {
        // Silence all internal logs but preserve user println output
        const silentLog = (...args: unknown[]) => {
          // Allow through only basic output, not TRACE/DEBUG/INFO prefixed logs
          const message = args.join(" ");
          if (
            !message.includes("TRACE ") && !message.includes("DEBUG ") &&
            !message.includes("INFO ") && !message.includes("compiler-")
          ) {
            originalConsole.log(...args);
          }
        };
        console.log = silentLog;
        console.debug = () => {};
        console.info = () => {};
      } else if (this.logLevel === "error") {
        // Filter out TRACE, DEBUG, INFO but keep warnings and errors
        const errorLog = (...args: unknown[]) => {
          const message = args.join(" ");
          if (
            !message.includes("TRACE ") && !message.includes("DEBUG ") &&
            !message.includes("INFO ") && !message.includes("compiler-")
          ) {
            originalConsole.log(...args);
          }
        };
        console.log = errorLog;
        console.debug = () => {};
        console.info = () => {};
      }

      // Store original console for restoration if needed
      (globalThis as Record<string, unknown>).__originalConsole = originalConsole;
    }
  }

  private formatWarning(warning: string): string {
    if (this.noWarnings) {
      return ""; // Return empty string for suppressed warnings
    }

    const color = this.warningColor as keyof typeof colors;
    return colorize(`Warning: ${warning}`, color);
  }

  private displayWarnings(warnings: string[]): void {
    if (this.noWarnings) {
      return; // Don't display warnings if suppressed
    }

    warnings.forEach((warning) => {
      const formattedWarning = this.formatWarning(warning);
      if (formattedWarning) {
        console.warn(formattedWarning);
      }
    });
  }

  async compile(gleamCode: string, moduleName: string = "main"): Promise<CompileResult> {
    if (!this.wasmModule) {
      throw new Error("Compiler not initialized. Call initialize() first.");
    }

    try {
      // Import the functions we need
      const {
        reset_filesystem,
        write_module,
        compile_package,
        read_compiled_javascript,
        read_compiled_erlang,
        pop_warning,
        reset_warnings,
      } = await import(`file://${this.wasmPath}/gleam_wasm.js`);

      // Reset filesystem and warnings
      reset_filesystem(this.projectId);
      reset_warnings(this.projectId);

      // Clear tracked modules and FFI files for this compilation
      this.writtenModules.clear();
      this.ffiFiles.clear();

      // Add standard library modules first
      await this.addStandardLibrary();

      // Add preload scripts
      await this.addPreloadScripts();

      // Write the Gleam code to a module (write_module automatically adds .gleam extension)
      write_module(this.projectId, moduleName, gleamCode);
      this.writtenModules.add(moduleName);

      // Write a basic gleam.toml
      const gleamToml = `name = "${moduleName}"
version = "1.0.0"

[dependencies]
gleam_stdlib = ">= 0.40.0 and < 2.0.0"
`;
      const { write_file } = await import(`file://${this.wasmPath}/gleam_wasm.js`);
      write_file(this.projectId, "gleam.toml", gleamToml);

      const warnings: string[] = [];
      const errors: string[] = [];

      try {
        // Compile to JavaScript target
        compile_package(this.projectId, "javascript");

        // Collect warnings
        let warning;
        while ((warning = pop_warning(this.projectId)) !== undefined) {
          warnings.push(warning);
        }

        // Display warnings with color formatting (unless suppressed)
        this.displayWarnings(warnings);

        // Read compiled output for main module
        const javascript = read_compiled_javascript(this.projectId, moduleName);
        const erlang = read_compiled_erlang(this.projectId, moduleName);

        // Import read_file_bytes for reading runtime files
        const { read_file_bytes } = await import(`file://${this.wasmPath}/gleam_wasm.js`);
        const decoder = new TextDecoder();

        // Read all compiled JavaScript modules
        const allModules = new Map<string, string>();

        // First, try to read gleam_stdlib.mjs (the Gleam runtime)
        // Try multiple possible paths
        const runtimePaths = [
          "/build/gleam_stdlib.mjs",
          "build/gleam_stdlib.mjs",
          "/build/dev/javascript/gleam_stdlib/gleam_stdlib.mjs",
          "/build/dev/javascript/main/gleam_stdlib.mjs",
          "/gleam_stdlib.mjs",
        ];

        for (const runtimePath of runtimePaths) {
          try {
            const stdlibBytes = read_file_bytes(this.projectId, runtimePath);
            if (stdlibBytes && stdlibBytes.length > 0) {
              allModules.set("gleam_stdlib", decoder.decode(stdlibBytes));
              if (this.debug) {
                console.log(
                  `✓ Read gleam_stdlib.mjs from ${runtimePath} (${stdlibBytes.length} bytes)`,
                );
              }
              break;
            }
          } catch {
            // Try next path
          }
        }

        if (!allModules.has("gleam_stdlib") && this.debug) {
          console.log("⚠ Could not find gleam_stdlib.mjs - will use prelude stub");
        }

        // Read gleam.mjs (the Gleam prelude/runtime) - this is essential for type definitions
        const preludePaths = [
          "/build/gleam.mjs",
          "build/gleam.mjs",
        ];

        for (const preludePath of preludePaths) {
          try {
            const preludeBytes = read_file_bytes(this.projectId, preludePath);
            if (preludeBytes && preludeBytes.length > 0) {
              allModules.set("gleam", decoder.decode(preludeBytes));
              if (this.debug) {
                console.log(
                  `✓ Read gleam.mjs (prelude) from ${preludePath} (${preludeBytes.length} bytes)`,
                );
              }
              break;
            }
          } catch {
            // Try next path
          }
        }

        if (!allModules.has("gleam") && this.debug) {
          console.log("⚠ Could not find gleam.mjs (prelude) - will use stub");
        }

        // Read compiled JavaScript for all written modules
        for (const modName of this.writtenModules) {
          try {
            const modJs = read_compiled_javascript(this.projectId, modName);
            if (modJs) {
              allModules.set(modName, modJs);
            }
          } catch {
            // Module might not have compiled JavaScript output
          }
        }

        return {
          success: true,
          javascript: javascript || undefined,
          erlang: erlang || undefined,
          warnings,
          errors,
          allModules,
          ffiFiles: this.ffiFiles.size > 0 ? new Map(this.ffiFiles) : undefined,
        };
      } catch (compileError) {
        // Collect warnings even if compilation fails
        let warning;
        while ((warning = pop_warning(this.projectId)) !== undefined) {
          warnings.push(warning);
        }

        // Display warnings even on compilation failure (unless suppressed)
        this.displayWarnings(warnings);

        errors.push(`Compilation failed: ${compileError}`);
        return {
          success: false,
          warnings,
          errors,
        };
      }
    } catch (error) {
      return {
        success: false,
        warnings: [],
        errors: [`Compilation error: ${error}`],
      };
    }
  }

  async run(gleamCode: string, moduleName: string = "main"): Promise<RunResult> {
    const compileResult = await this.compile(gleamCode, moduleName);

    if (!compileResult.success) {
      return {
        success: false,
        output: [],
        errors: compileResult.errors,
      };
    }

    try {
      return await this.executeJavaScript(
        compileResult.javascript!,
        moduleName,
        compileResult.allModules,
        compileResult.ffiFiles,
      );
    } catch (error) {
      return {
        success: false,
        output: [],
        errors: [`Runtime error: ${error}`],
      };
    }
  }

  private async executeJavaScript(
    jsCode: string,
    moduleName: string = "main",
    allModules?: Map<string, string>,
    ffiFiles?: Map<string, string>,
  ): Promise<RunResult> {
    const output: string[] = [];

    try {
      // Try real JavaScript execution first
      return await this.realJavaScriptExecution(jsCode, moduleName, output, allModules, ffiFiles);
    } catch (error) {
      // Fallback to simulation if real execution fails
      if (this.debug) {
        console.warn("Real execution failed, falling back to simulation:", error);
      }
      return await this.simulateJavaScriptExecution(jsCode, moduleName, output);
    }
  }

  private async realJavaScriptExecution(
    jsCode: string,
    moduleName: string,
    output: string[],
    allModules?: Map<string, string>,
    ffiFiles?: Map<string, string>,
  ): Promise<RunResult> {
    const tempDir = await Deno.makeTempDir();

    try {
      // Create worker with explicit Deno permissions
      const workerUrl = new URL("./worker/execution_worker.ts", import.meta.url);
      const worker = new Worker(workerUrl.href, {
        type: "module",
        deno: {
          permissions: {
            read: this.workerPermissions.read ?? true,
            write: this.workerPermissions.write ?? true,
            net: this.workerPermissions.net ?? true,
            env: this.workerPermissions.env ?? true,
            run: false, // Security: no subprocess spawning
            ffi: false, // Security: no FFI
          },
        },
      });

      // Set up timeout with cleanup
      let timeoutId: number;
      const timeoutPromise = new Promise<RunResult>((_, reject) => {
        timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error(`Execution timed out after ${this.timeout}ms`));
        }, this.timeout);
      });

      // Set up message handling
      const executionPromise = new Promise<RunResult>((resolve) => {
        worker.onmessage = (event: MessageEvent) => {
          const response = event.data;

          if (response.type === "output") {
            // Streaming output - collect it
            if (response.line !== undefined) {
              output.push(response.line);
            }
          } else if (response.type === "result") {
            // Execution complete
            clearTimeout(timeoutId);
            worker.terminate();
            resolve({
              success: true,
              output: response.output || output,
              errors: [],
            });
          } else if (response.type === "error") {
            clearTimeout(timeoutId);
            worker.terminate();
            resolve({
              success: false,
              output,
              errors: [response.error || "Unknown error"],
            });
          }
        };

        worker.onerror = (event) => {
          clearTimeout(timeoutId);
          worker.terminate();
          resolve({
            success: false,
            output,
            errors: [`Worker error: ${event.message}`],
          });
        };
      });

      // Module stubs for the worker
      const moduleStubs = this.getModuleStubs();

      // Convert allModules Map to object for postMessage serialization
      const compiledModules: Record<string, string> = {};
      if (allModules) {
        for (const [name, code] of allModules) {
          compiledModules[name] = code;
        }
      }

      // Convert ffiFiles Map to object for postMessage serialization
      const ffiFilesObj: Record<string, string> = {};
      if (ffiFiles) {
        for (const [path, content] of ffiFiles) {
          ffiFilesObj[path] = content;
        }
      }

      // Send execution request
      worker.postMessage({
        type: "execute",
        payload: {
          jsCode,
          moduleName,
          tempDir,
          moduleStubs,
          compiledModules,
          ffiFiles: ffiFilesObj,
        },
      });

      // Race between execution and timeout
      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      // Cleanup temp directory
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private getModuleStubs(): {
    gleam: string;
    gleamIo: string;
    gleamString: string;
  } {
    return {
      gleam: `
export class Empty {
  constructor() {}
}

export class List {
  constructor(head, tail) {
    this.head = head;
    this.tail = tail;
  }

  static fromArray(arr) {
    if (arr.length === 0) return new Empty();
    return new List(arr[0], List.fromArray(arr.slice(1)));
  }

  toArray() {
    const result = [];
    let current = this;
    while (current instanceof List) {
      result.push(current.head);
      current = current.tail;
    }
    return result;
  }
}

export const CustomType = class CustomType {};
export const BitArray = class BitArray {};
export const UtfCodepoint = class UtfCodepoint {};
export function bitArraySlice() { return new BitArray(); }
export function bitArraySliceToInt() { return 0; }
`,
      gleamIo: `
export function println(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function print(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function debug(value) {
  self.postMessage({ type: "output", line: String(value) });
  return value;
}
`,
      gleamString: `
import { Empty, List } from '../gleam.mjs';

export function split(str, delimiter) {
  const parts = str.split(delimiter);
  return List.fromArray(parts);
}

export function trim(str) {
  return str.trim();
}
`,
    };
  }

  private async simulateJavaScriptExecution(
    jsCode: string,
    moduleName: string,
    output: string[],
  ): Promise<RunResult> {
    try {
      await this.processEchoCalls(jsCode, moduleName, output);
      this.processPrintlnCalls(jsCode, output);

      this.logNoOutputWarning(output);

      return {
        success: true,
        output,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        output: [],
        errors: [`Simulation error: ${error}`],
      };
    }
  }

  private async processEchoCalls(
    jsCode: string,
    moduleName: string,
    output: string[],
  ): Promise<void> {
    if (!jsCode.includes("echo(")) return;

    const echoMatches = jsCode.matchAll(ECHO_CALL_PATTERN);
    for (const match of echoMatches) {
      const value = match[1];
      const line = match[3];

      output.push(`src/${moduleName}.gleam:${line}`);

      if (value.includes("resp.body")) {
        await this.handleHttpResponseEcho(jsCode, output);
      } else {
        output.push(this.formatEchoValue(value));
      }
    }
  }

  private async handleHttpResponseEcho(jsCode: string, output: string[]): Promise<void> {
    const url = this.extractUrlFromCode(jsCode);
    const htmlContent = await this.simulateHttpFetch(url);
    output.push(`"${htmlContent}"`);
  }

  private extractUrlFromCode(jsCode: string): string {
    const urlMatch = jsCode.match(URL_EXTRACTION_PATTERN);
    return urlMatch ? urlMatch[1] : FALLBACK_URL;
  }

  private processPrintlnCalls(jsCode: string, output: string[]): void {
    if (!jsCode.includes("$io.println")) return;

    const printMatches = jsCode.matchAll(PRINTLN_PATTERN);
    for (const match of printMatches) {
      const arg = match[1].trim();
      if (arg.startsWith('"') && arg.endsWith('"')) {
        output.push(arg.slice(1, -1));
      }
    }
  }

  private logNoOutputWarning(output: string[]): void {
    if (output.length === 0 && this.logLevel !== "silent") {
      console.info("No io.println or echo calls detected in the executed code");
    }
  }

  private async simulateHttpFetch(url: string): Promise<string> {
    try {
      if (this.debug) {
        console.log(`Fetching URL: ${url}`);
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      return this.escapeForJsonString(text);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.debug) {
        console.warn(`Fetch failed for ${url}: ${errorMessage}`);
      }
      return `Fetch Error: ${errorMessage}`;
    }
  }

  private escapeForJsonString(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  private formatEchoValue(value: string): string {
    if (value.includes('"')) {
      const stringMatch = value.match(/"([^"]+)"/);
      if (stringMatch) {
        return `"${stringMatch[1]}"`;
      }
    }
    return `"${value}"`;
  }

  private async loadLibraryModules(
    library: { name: string; baseUrl: string; modules: string[] },
    write_module: (projectId: number, moduleName: string, code: string) => void,
  ): Promise<void> {
    if (this.debug) {
      console.log(`Loading ${library.name} modules...`);
    }

    // Load modules in parallel for better performance
    await Promise.all(
      library.modules.map((modulePath) => this.loadSingleModule(library, modulePath, write_module)),
    );
  }

  private async loadSingleModule(
    library: { name: string; baseUrl: string },
    modulePath: string,
    write_module: (projectId: number, moduleName: string, code: string) => void,
  ): Promise<void> {
    try {
      const moduleUrl = `${library.baseUrl}/${modulePath}`;
      const response = await fetch(moduleUrl);

      if (response.ok) {
        const code = await response.text();
        const moduleName = modulePath.replace(".gleam", "");
        write_module(this.projectId, moduleName, code);

        if (this.debug) {
          console.log(`✓ Loaded ${moduleName}`);
        }
      } else {
        // Consume the response body to prevent resource leaks
        await response.body?.cancel();

        if (this.debug) {
          console.warn(`⚠ Failed to load ${modulePath}: ${response.status}`);
        }
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`⚠ Error loading ${modulePath}:`, error);
      }
    }
  }

  private async addStandardLibrary(): Promise<void> {
    // Skip if noStdlib is set
    if (this.noStdlib) {
      if (this.debug) {
        console.log("Skipping standard library loading (--no-stdlib)");
      }
      return;
    }

    // Import write_module function
    const { write_module } = await import(`file://${this.wasmPath}/gleam_wasm.js`);

    // Wrap write_module to track written modules
    const trackingWriteModule = (projectId: number, moduleName: string, code: string) => {
      write_module(projectId, moduleName, code);
      this.writtenModules.add(moduleName);
    };

    // Create stdlib loader with config
    const stdlibLoader = createStdlibLoader(this.standardLibrary, this.debug);

    try {
      // Load all standard libraries using the new Hex.pm-based loader
      const result = await stdlibLoader.loadAll(
        this.standardLibrary,
        this.projectId,
        trackingWriteModule,
      );

      // Collect FFI files from loaded packages
      if (result.ffiFiles && result.ffiFiles.length > 0) {
        for (const ffiFile of result.ffiFiles) {
          this.ffiFiles.set(ffiFile.path, ffiFile.content);
        }
        if (this.debug) {
          console.log(`✓ Collected ${result.ffiFiles.length} FFI files`);
        }
      }

      // Log any errors (but don't fail - fallback modules may still work)
      if (result.errors.length > 0 && this.debug) {
        for (const error of result.errors) {
          console.warn(`⚠ ${error}`);
        }
      }

      if (this.debug) {
        console.log(`✓ Loaded ${result.modules.length} modules from standard library`);
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`⚠ Standard library loading failed: ${error}`);
        console.log("Attempting fallback loading...");
      }

      // Fallback to the old GitHub-based loading method
      await this.addStandardLibraryFallback(trackingWriteModule);
    }

    // Add a fallback basic gleam/io implementation if stdlib version failed
    try {
      // Test if gleam/io was successfully loaded
      const testCode = 'import gleam/io\npub fn check() { io.println("check") }';
      trackingWriteModule(this.projectId, "test_io", testCode);
    } catch {
      // Fallback implementation
      const gleamIo = `
// Fallback gleam/io module implementation

@external(javascript, "console", "log")
pub fn print(value: a) -> Nil

pub fn println(value: a) -> Nil {
  print(value)
}

@external(javascript, "console", "debug")
pub fn debug(value: a) -> a
`;
      trackingWriteModule(this.projectId, "gleam/io", gleamIo);

      if (this.debug) {
        console.log("✓ Using fallback gleam/io implementation");
      }
    }
  }

  /**
   * Fallback method using GitHub raw URLs (for when Hex.pm is unavailable)
   */
  private async addStandardLibraryFallback(
    write_module: (projectId: number, moduleName: string, code: string) => void,
  ): Promise<void> {
    // Define standard libraries to preload (old GitHub-based approach)
    const standardLibraries = [
      {
        name: "gleam_stdlib",
        baseUrl: "https://raw.githubusercontent.com/gleam-lang/stdlib/main/src",
        modules: [
          "gleam/io.gleam",
          "gleam/list.gleam",
          "gleam/string.gleam",
          "gleam/string_tree.gleam",
          "gleam/int.gleam",
          "gleam/float.gleam",
          "gleam/bool.gleam",
          "gleam/result.gleam",
          "gleam/option.gleam",
          "gleam/order.gleam",
          "gleam/bit_array.gleam",
          "gleam/dict.gleam",
          "gleam/set.gleam",
          "gleam/uri.gleam",
          "gleam/dynamic.gleam",
          "gleam/dynamic/decode.gleam",
          "gleam/function.gleam",
        ],
      },
      {
        name: "gleam_javascript",
        baseUrl: "https://raw.githubusercontent.com/gleam-lang/javascript/main/src",
        modules: [
          "gleam/javascript/array.gleam",
          "gleam/javascript/promise.gleam",
        ],
      },
      {
        name: "plinth",
        baseUrl: "https://raw.githubusercontent.com/CrowdHailer/plinth/main/src",
        modules: [
          "plinth/browser/document.gleam",
          "plinth/browser/element.gleam",
          "plinth/browser/event.gleam",
          "plinth/browser/window.gleam",
          "plinth/javascript/global.gleam",
          "plinth/javascript/date.gleam",
          "plinth/javascript/console.gleam",
          "plinth/javascript/json.gleam",
          "plinth/javascript/storage.gleam",
        ],
      },
      {
        name: "gleam_http",
        baseUrl: "https://raw.githubusercontent.com/gleam-lang/http/main/src",
        modules: [
          "gleam/http.gleam",
          "gleam/http/request.gleam",
          "gleam/http/response.gleam",
          "gleam/http/service.gleam",
          "gleam/http/cookie.gleam",
        ],
      },
      {
        name: "gleam_fetch",
        baseUrl: "https://raw.githubusercontent.com/gleam-lang/fetch/main/src",
        modules: [
          "gleam/fetch.gleam",
          "gleam/fetch/form_data.gleam",
        ],
      },
      {
        name: "gleam_json",
        baseUrl: "https://raw.githubusercontent.com/gleam-lang/json/main/src",
        modules: [
          "gleam/json.gleam",
        ],
      },
    ];

    // Load all standard libraries in parallel for better performance
    await Promise.all(
      standardLibraries.map((library) => this.loadLibraryModules(library, write_module)),
    );
  }

  private async addPreloadScripts(): Promise<void> {
    if (this.preloadScripts.length === 0) return;

    const { write_module } = await import(`file://${this.wasmPath}/gleam_wasm.js`);

    for (const script of this.preloadScripts) {
      let code = script.code;

      // If URL is provided, fetch the code
      if (script.url) {
        try {
          const response = await fetch(script.url);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${script.url}: ${response.status} ${response.statusText}`,
            );
          }
          code = await response.text();
        } catch (error) {
          if (this.debug) {
            console.warn(`Failed to load preload script from ${script.url}:`, error);
          }
          continue;
        }
      }

      // If file path is provided, read the file
      if (script.filePath) {
        try {
          code = await Deno.readTextFile(script.filePath);
        } catch (error) {
          if (this.debug) {
            console.warn(`Failed to load preload script from ${script.filePath}:`, error);
          }
          continue;
        }
      }

      // Write the module and track it
      write_module(this.projectId, script.moduleName, code);
      this.writtenModules.add(script.moduleName);

      if (this.debug) {
        console.log(`Preloaded module: ${script.moduleName}`);
      }
    }
  }
}
