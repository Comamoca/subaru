import { downloadGleamWasmToPath, getWasmCacheDir } from "./setup.ts";
import { Logger, type LogLevel } from "./logger.ts";
import { WasmModule } from "./wasm/wasm_module.ts";
import { createStdlibLoader, type StandardLibraryConfig } from "./stdlib/mod.ts";

const STUBS_DIR = new URL("./worker/stubs/", import.meta.url);

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
  code?: string;
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
  logLevel?: LogLevel;
  preloadScripts?: PreloadScript[];
  noWarnings?: boolean;
  warningColor?: "red" | "yellow" | "green" | "blue" | "magenta" | "cyan" | "white" | "gray";
  noStdlib?: boolean;
  standardLibrary?: StandardLibraryConfig;
  workerPermissions?: WorkerPermissions;
  timeout?: number;
}

// Constants for default values
const DEFAULT_LOG_LEVEL = "silent";
const DEFAULT_WARNING_COLOR = "yellow";

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

  // 2. Check local ./wasm-compiler directory (user-placed, takes priority over cache)
  const localPath = `${Deno.cwd()}/wasm-compiler`;
  if (await wasmExists(localPath)) {
    if (debug) {
      console.log(`Using WASM compiler from local directory: ${localPath}`);
    }
    return localPath;
  }

  // 3. Check cache directory
  const cachePath = getWasmCacheDir();
  if (await wasmExists(cachePath)) {
    if (debug) {
      console.log(`Using WASM compiler from cache: ${cachePath}`);
    }
    return cachePath;
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
  private wasm: WasmModule = new WasmModule();
  private projectId: number = 0;
  private debug: boolean;
  private logger: Logger;
  private preloadScripts: PreloadScript[];
  private noWarnings: boolean;
  private warningColor: string;
  private noStdlib: boolean;
  private standardLibrary: StandardLibraryConfig;
  private workerPermissions: WorkerPermissions;
  private timeout: number;
  // Module stubs loaded from external files
  private moduleStubs: {
    gleam: string;
    gleamIo: string;
    gleamString: string;
  } = { gleam: "", gleamIo: "", gleamString: "" };
  // Track all module names written during compilation
  private writtenModules: Set<string> = new Set();
  // Track FFI files collected during stdlib loading
  private ffiFiles: Map<string, string> = new Map();

  constructor(config: GleamRunnerConfig = {}) {
    this.wasmPath = config.wasmPath || "";
    this.debug = config.debug || false;
    this.logger = new Logger(config.logLevel || DEFAULT_LOG_LEVEL);
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
    this.loadModuleStubs();
  }

  private loadModuleStubs(): void {
    const resolveStub = (name: string): string => {
      const url = new URL(name, STUBS_DIR);
      return Deno.readTextFileSync(url);
    };
    this.moduleStubs = {
      gleam: resolveStub("gleam.mjs"),
      gleamIo: resolveStub("gleam_io.mjs"),
      gleamString: resolveStub("gleam_string.mjs"),
    };
  }

  async initialize(): Promise<void> {
    try {
      // Resolve WASM path (with auto-download if needed)
      this.wasmPath = await resolveWasmPath(this.wasmPath, this.debug);

      this.logger.debug(`WASM compiler location: ${this.wasmPath}`);

      await this.wasm.initialize(this.wasmPath, this.debug);

      this.logger.debug("Gleam WASM compiler initialized successfully");
    } catch (error) {
      throw new Error(`Failed to initialize Gleam WASM compiler: ${error}`);
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
        this.logger.warn(formattedWarning);
      }
    });
  }

  async compile(gleamCode: string, moduleName: string = "main"): Promise<CompileResult> {
    if (!this.wasm.isInitialized) {
      throw new Error("Compiler not initialized. Call initialize() first.");
    }

    try {
      // Reset filesystem and warnings
      this.wasm.resetFilesystem(this.projectId);
      this.wasm.resetWarnings(this.projectId);

      // Clear tracked modules and FFI files for this compilation
      this.writtenModules.clear();
      this.ffiFiles.clear();

      // Add standard library modules first
      await this.addStandardLibrary();

      // Add preload scripts
      await this.addPreloadScripts();

      // Write the Gleam code to a module
      this.wasm.writeModule(this.projectId, moduleName, gleamCode);
      this.writtenModules.add(moduleName);

      // Write a basic gleam.toml
      const gleamToml = `name = "${moduleName}"
version = "1.0.0"

[dependencies]
gleam_stdlib = ">= 0.40.0 and < 2.0.0"
`;
      this.wasm.writeFile(this.projectId, "gleam.toml", gleamToml);

      const warnings: string[] = [];
      const errors: string[] = [];

      try {
        // Compile to JavaScript target
        this.wasm.compile(this.projectId, "javascript");

        // Collect warnings
        let warning;
        while ((warning = this.wasm.popWarning(this.projectId)) !== undefined) {
          warnings.push(warning);
        }

        // Display warnings with color formatting (unless suppressed)
        this.displayWarnings(warnings);

        // Read compiled output for main module
        const javascript = this.wasm.readCompiledJavaScript(this.projectId, moduleName);
        const erlang = this.wasm.readCompiledErlang(this.projectId, moduleName);

        const decoder = new TextDecoder();

        // Read all compiled JavaScript modules
        const allModules = new Map<string, string>();

        // Try to read gleam_stdlib.mjs (the Gleam runtime) from multiple possible paths
        const runtimePaths = [
          "/build/gleam_stdlib.mjs",
          "build/gleam_stdlib.mjs",
          "/build/dev/javascript/gleam_stdlib/gleam_stdlib.mjs",
          "/build/dev/javascript/main/gleam_stdlib.mjs",
          "/gleam_stdlib.mjs",
        ];

        for (const runtimePath of runtimePaths) {
          try {
            const stdlibBytes = this.wasm.readFileBytes(this.projectId, runtimePath);
            if (stdlibBytes && stdlibBytes.length > 0) {
              allModules.set("gleam_stdlib", decoder.decode(stdlibBytes));
              this.logger.debug(
                `✓ Read gleam_stdlib.mjs from ${runtimePath} (${stdlibBytes.length} bytes)`,
              );
              break;
            }
          } catch {
            // Try next path
          }
        }

        if (!allModules.has("gleam_stdlib")) {
          this.logger.debug("⚠ Could not find gleam_stdlib.mjs - will use prelude stub");
        }

        // Read gleam.mjs (the Gleam prelude/runtime)
        const preludePaths = [
          "/build/gleam.mjs",
          "build/gleam.mjs",
        ];

        for (const preludePath of preludePaths) {
          try {
            const preludeBytes = this.wasm.readFileBytes(this.projectId, preludePath);
            if (preludeBytes && preludeBytes.length > 0) {
              allModules.set("gleam", decoder.decode(preludeBytes));
              this.logger.debug(
                `✓ Read gleam.mjs (prelude) from ${preludePath} (${preludeBytes.length} bytes)`,
              );
              break;
            }
          } catch {
            // Try next path
          }
        }

        if (!allModules.has("gleam")) {
          this.logger.debug("⚠ Could not find gleam.mjs (prelude) - will use stub");
        }

        // Read compiled JavaScript for all written modules
        for (const modName of this.writtenModules) {
          try {
            const modJs = this.wasm.readCompiledJavaScript(this.projectId, modName);
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
        while ((warning = this.wasm.popWarning(this.projectId)) !== undefined) {
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
    return await this.realJavaScriptExecution(jsCode, moduleName, [], allModules, ffiFiles);
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
      let timeoutId: ReturnType<typeof setTimeout>;
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
    return this.moduleStubs;
  }

  private async addStandardLibrary(): Promise<void> {
    // Skip if noStdlib is set
    if (this.noStdlib) {
      this.logger.debug("Skipping standard library loading (--no-stdlib)");
      return;
    }

    // Wrap wasm.writeModule to track written modules
    const trackingWriteModule = (projectId: number, moduleName: string, code: string) => {
      this.wasm.writeModule(projectId, moduleName, code);
      this.writtenModules.add(moduleName);
    };

    // Create stdlib loader with config
    const stdlibLoader = createStdlibLoader(this.standardLibrary, this.debug);

    const result = await stdlibLoader.loadAll(this.projectId, trackingWriteModule);

    // Collect FFI files from loaded packages
    if (result.ffiFiles && result.ffiFiles.length > 0) {
      for (const ffiFile of result.ffiFiles) {
        this.ffiFiles.set(ffiFile.path, ffiFile.content);
      }
      this.logger.debug(`✓ Collected ${result.ffiFiles.length} FFI files`);
    }

    // Write FFI files to the WASM virtual filesystem so the compiler can
    // find and copy them during the copying_native_source_files step
    if (result.ffiFiles && result.ffiFiles.length > 0) {
      for (const ffiFile of result.ffiFiles) {
        try {
          this.wasm.writeFile(this.projectId, `src/${ffiFile.path}`, ffiFile.content);
          this.logger.debug(`✓ Wrote FFI file to VFS: src/${ffiFile.path}`);
        } catch (error) {
          this.logger.warn(`⚠ Failed to write FFI file src/${ffiFile.path}: ${error}`);
        }
      }
    }

    // Log any errors (but don't fail - fallback modules may still work)
    for (const error of result.errors) {
      this.logger.warn(`⚠ ${error}`);
    }

    this.logger.debug(`✓ Loaded ${result.modules.length} modules from standard library`);

    // Add fallback gleam/io if stdlib loading failed to load it
    if (!result.modules.some((m) => m.moduleName === "gleam/io")) {
      stdlibLoader.addFallbackIo(this.projectId, trackingWriteModule);
    }
  }

  private async addPreloadScripts(): Promise<void> {
    if (this.preloadScripts.length === 0) return;

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
          this.logger.warn(`Failed to load preload script from ${script.url}:`, error);
          continue;
        }
      }

      // If file path is provided, read the file
      if (script.filePath) {
        try {
          code = await Deno.readTextFile(script.filePath);
        } catch (error) {
          this.logger.warn(`Failed to load preload script from ${script.filePath}:`, error);
          continue;
        }
      }

      // Write the module and track it
      if (code === undefined) continue;
      this.wasm.writeModule(this.projectId, script.moduleName, code);
      this.writtenModules.add(script.moduleName);

      this.logger.debug(`Preloaded module: ${script.moduleName}`);
    }
  }
}
