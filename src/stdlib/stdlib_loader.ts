/**
 * Standard library loader
 *
 * Orchestrates loading of builtin and third-party packages from Hex.pm
 */

import {
  extractHexTarball,
  getModuleNameFromPath,
  HexClient,
  PackageCache,
  type PackageCacheConfig,
} from "../hex/mod.ts";
import {
  BUILTIN_PACKAGE_MODULES,
  BUILTIN_PACKAGE_NAMES,
  type BuiltinPackageName,
  FALLBACK_GITHUB_URLS,
} from "./builtin_packages.ts";

export interface ThirdPartyPackage {
  name: string;
  version?: string; // If omitted, uses latest version
}

export interface StandardLibraryConfig {
  // User-specified third-party packages
  packages?: (string | ThirdPartyPackage)[];
  cache?: PackageCacheConfig;
}

export interface LoadedModule {
  moduleName: string;
  code: string;
  packageName: string;
}

export interface FFIFile {
  path: string; // e.g., "filepath_ffi.mjs"
  content: string;
}

export interface LoadResult {
  modules: LoadedModule[];
  ffiFiles: FFIFile[];
  errors: string[];
}

type WriteModuleFn = (projectId: number, moduleName: string, code: string) => void;

export class StdlibLoader {
  private hexClient: HexClient;
  private cache: PackageCache;
  private debug: boolean;
  private loadedPackages: Set<string> = new Set();

  constructor(config: StandardLibraryConfig = {}, debug: boolean = false) {
    this.hexClient = new HexClient();
    this.cache = new PackageCache(config.cache);
    this.debug = debug;
  }

  /**
   * Load all builtin packages
   */
  async loadBuiltinPackages(
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    for (const packageName of BUILTIN_PACKAGE_NAMES) {
      try {
        const packageResult = await this.loadPackage(
          packageName,
          undefined,
          projectId,
          writeModule,
        );
        result.modules.push(...packageResult.modules);
        result.ffiFiles.push(...packageResult.ffiFiles);
        result.errors.push(...packageResult.errors);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to load builtin package ${packageName}: ${errorMsg}`);

        // Try fallback loading from GitHub
        if (this.debug) {
          console.log(`Attempting fallback loading for ${packageName}...`);
        }

        const fallbackResult = await this.loadPackageFromGitHub(
          packageName as BuiltinPackageName,
          projectId,
          writeModule,
        );
        result.modules.push(...fallbackResult.modules);
        result.ffiFiles.push(...fallbackResult.ffiFiles);
      }
    }

    return result;
  }

  /**
   * Load third-party packages specified in config
   */
  async loadThirdPartyPackages(
    packages: (string | ThirdPartyPackage)[],
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    for (const pkg of packages) {
      const packageName = typeof pkg === "string" ? pkg : pkg.name;
      const version = typeof pkg === "string" ? undefined : pkg.version;

      // Skip if already loaded as a builtin
      if (this.loadedPackages.has(packageName)) {
        if (this.debug) {
          console.log(`Skipping ${packageName} (already loaded)`);
        }
        continue;
      }

      try {
        const packageResult = await this.loadPackage(packageName, version, projectId, writeModule);
        result.modules.push(...packageResult.modules);
        result.ffiFiles.push(...packageResult.ffiFiles);
        result.errors.push(...packageResult.errors);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to load package ${packageName}: ${errorMsg}`);
      }
    }

    return result;
  }

  /**
   * Load all standard libraries (builtin + third-party)
   */
  async loadAll(
    config: StandardLibraryConfig,
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    // Load the Gleam prelude first (essential runtime types)
    try {
      const preludeResult = await this.loadGleamPrelude();
      result.ffiFiles.push(...preludeResult.ffiFiles);
      if (this.debug) {
        console.log("✓ Loaded Gleam prelude (runtime types)");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to load Gleam prelude: ${errorMsg}`);
      if (this.debug) {
        console.warn(`⚠ Failed to load Gleam prelude: ${errorMsg}`);
      }
    }

    // Load builtin packages first
    const builtinResult = await this.loadBuiltinPackages(projectId, writeModule);
    result.modules.push(...builtinResult.modules);
    result.ffiFiles.push(...builtinResult.ffiFiles);
    result.errors.push(...builtinResult.errors);

    // Load third-party packages if specified
    if (config.packages && config.packages.length > 0) {
      const thirdPartyResult = await this.loadThirdPartyPackages(
        config.packages,
        projectId,
        writeModule,
      );
      result.modules.push(...thirdPartyResult.modules);
      result.ffiFiles.push(...thirdPartyResult.ffiFiles);
      result.errors.push(...thirdPartyResult.errors);
    }

    return result;
  }

  /**
   * Load the Gleam prelude (runtime types like CustomType, List, Result, etc.)
   * This is essential for compiled Gleam code to work
   */
  private async loadGleamPrelude(): Promise<{ ffiFiles: FFIFile[] }> {
    const preludeUrl =
      "https://raw.githubusercontent.com/gleam-lang/gleam/main/compiler-core/templates/prelude.mjs";

    const response = await fetch(preludeUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Gleam prelude: ${response.status}`);
    }

    const preludeContent = await response.text();

    return {
      ffiFiles: [
        { path: "gleam_prelude.mjs", content: preludeContent },
      ],
    };
  }

  /**
   * Load a single package from Hex.pm
   */
  private async loadPackage(
    packageName: string,
    version: string | undefined,
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    // Determine version to use
    let targetVersion = version;
    if (!targetVersion) {
      targetVersion = await this.hexClient.getLatestVersion(packageName);
    }

    if (this.debug) {
      console.log(`Loading package ${packageName}@${targetVersion}...`);
    }

    // Check cache first
    const cachedFiles = await this.cache.get(packageName, targetVersion);
    if (cachedFiles) {
      if (this.debug) {
        console.log(`Using cached version of ${packageName}@${targetVersion}`);
      }

      for (const [moduleName, code] of cachedFiles) {
        // Check if this is an FFI file (stored with .mjs or .js extension in the key)
        if (moduleName.endsWith(".mjs") || moduleName.endsWith(".js")) {
          result.ffiFiles.push({ path: moduleName, content: code });
        } else {
          writeModule(projectId, moduleName, code);
          result.modules.push({ moduleName, code, packageName });
        }
      }

      this.loadedPackages.add(packageName);
      return result;
    }

    // Download from Hex.pm
    if (this.debug) {
      console.log(`Downloading ${packageName}@${targetVersion} from Hex.pm...`);
    }

    const tarball = await this.hexClient.downloadTarball(packageName, targetVersion);

    // Extract Gleam source files and FFI files
    const extracted = await extractHexTarball(tarball);

    // Cache the extracted files
    await this.cache.set(packageName, targetVersion, extracted.files);

    // Process files - separate Gleam modules from FFI files
    let moduleCount = 0;
    let ffiCount = 0;
    for (const file of extracted.files) {
      if (file.isFFI) {
        // FFI file - extract just the filename (e.g., "filepath_ffi.mjs" from "src/filepath_ffi.mjs")
        const ffiPath = file.path.replace(/^src\//, "");
        result.ffiFiles.push({ path: ffiPath, content: file.content });
        ffiCount++;
      } else {
        // Gleam module
        const moduleName = getModuleNameFromPath(file.path);
        writeModule(projectId, moduleName, file.content);
        result.modules.push({ moduleName, code: file.content, packageName });
        moduleCount++;
      }
    }

    this.loadedPackages.add(packageName);

    if (this.debug) {
      console.log(
        `✓ Loaded ${moduleCount} modules and ${ffiCount} FFI files from ${packageName}`,
      );
    }

    return result;
  }

  /**
   * Fallback: Load package modules from GitHub
   */
  private async loadPackageFromGitHub(
    packageName: BuiltinPackageName,
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    const baseUrl = FALLBACK_GITHUB_URLS[packageName];
    const modules = BUILTIN_PACKAGE_MODULES[packageName];

    if (!baseUrl || !modules) {
      return result;
    }

    // Load modules in parallel
    const loadPromises = modules.map(async (modulePath) => {
      try {
        const moduleUrl = `${baseUrl}/${modulePath}`;
        const response = await fetch(moduleUrl);

        if (!response.ok) {
          await response.body?.cancel();
          return null;
        }

        const code = await response.text();
        const moduleName = modulePath.replace(/\.gleam$/, "");

        return { moduleName, code, packageName };
      } catch {
        return null;
      }
    });

    const loadedModules = await Promise.all(loadPromises);

    for (const module of loadedModules) {
      if (module) {
        writeModule(projectId, module.moduleName, module.code);
        result.modules.push(module);

        if (this.debug) {
          console.log(`✓ Loaded ${module.moduleName} (GitHub fallback)`);
        }
      }
    }

    this.loadedPackages.add(packageName);
    return result;
  }

  /**
   * Add fallback gleam/io implementation if standard loading failed
   */
  addFallbackIo(projectId: number, writeModule: WriteModuleFn): void {
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
    writeModule(projectId, "gleam/io", gleamIo);

    if (this.debug) {
      console.log("✓ Using fallback gleam/io implementation");
    }
  }
}

// Export a factory function for convenience
export function createStdlibLoader(
  config: StandardLibraryConfig = {},
  debug: boolean = false,
): StdlibLoader {
  return new StdlibLoader(config, debug);
}
