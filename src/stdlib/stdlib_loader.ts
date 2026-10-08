/**
 * Standard library loader
 *
 * Orchestrates loading of builtin and third-party packages from Hex.pm
 */

import {
  type ExtractedFile,
  extractHexTarball,
  getModuleNameFromPath,
  HexClient,
  PackageCache,
  type PackageCacheConfig,
} from "../hex/mod.ts";
import {
  DefaultDependencyProvider,
  type DependencySpec,
  PackageFetcher,
  ResolutionError,
  resolve as resolveDependencies,
} from "../deps/mod.ts";
import {
  BUILTIN_PACKAGE_MODULES,
  BUILTIN_PACKAGE_NAMES,
  type BuiltinPackageName,
  DEFAULT_PRESET,
  FALLBACK_GITHUB_URLS,
  getPresetPackages,
  type Preset,
} from "./builtin_packages.ts";

export interface PackageConfig {
  name: string;
  version?: string; // Hex requirement or exact version. If omitted, any version
  git?: string; // Git clone URL, for a package that is not on Hex
  ref?: string; // Branch, tag or commit for a git package (required with git)
  path?: string; // Local directory, relative to baseDir
  include?: string[]; // Load only specific modules (by module path, e.g., "gleam/io")
  exclude?: string[]; // Exclude specific modules (by module path)
}

// Backward compatibility alias
export type ThirdPartyPackage = PackageConfig;

export interface StandardLibraryConfig {
  preset?: Preset;
  // User-specified third-party packages (hex, git or local path)
  packages?: (string | PackageConfig)[];
  cache?: PackageCacheConfig;
  // Resolve transitive dependencies instead of loading only what is listed.
  // Defaults to true; set false to keep the older one-package-at-a-time behaviour.
  resolve?: boolean;
  // Directory that relative `path` dependencies resolve against (default: cwd)
  baseDir?: string;
}

export interface LoadedModule {
  moduleName: string;
  code: string;
  packageName: string;
}

export interface FFIFile {
  path: string; // e.g., "filepath_ffi.mjs"
  content: string;
  // Package that shipped the file. Namespacing needs it to place the file
  // under its own directory, and to tell a real cross-package collision apart
  // from the same file appearing twice.
  packageName: string;
}

export interface LoadResult {
  modules: LoadedModule[];
  ffiFiles: FFIFile[];
  errors: string[];
}

type WriteModuleFn = (projectId: number, moduleName: string, code: string) => void;

/**
 * Check if a module path matches a filter entry
 * Matches against both tarball path (src/gleam/io.gleam) and module name (gleam/io)
 */
function moduleMatchesFilter(modulePath: string, filterEntry: string): boolean {
  const moduleName = modulePath.replace(/^src\//, "").replace(/\.gleam$/, "");
  return modulePath === filterEntry ||
    modulePath.endsWith("/" + filterEntry) ||
    modulePath.endsWith("/" + filterEntry + ".gleam") ||
    moduleName === filterEntry ||
    moduleName.startsWith(filterEntry + "/");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turn a config package entry into a dependency spec for the resolver.
 *
 * A bare string, or an entry with only a name, means "any version from Hex" —
 * the resolver then picks the newest release the rest of the graph allows.
 */
function toDependencySpec(entry: string | PackageConfig): DependencySpec {
  if (typeof entry === "string") {
    return { source: "hex", name: entry, requirement: ">= 0.0.0" };
  }

  if (entry.git) {
    if (!entry.ref) {
      throw new Error(`Package  has a git URL but no ref`);
    }
    return { source: "git", name: entry.name, url: entry.git, ref: entry.ref };
  }

  if (entry.path) {
    return { source: "local", name: entry.name, path: entry.path };
  }

  return { source: "hex", name: entry.name, requirement: entry.version ?? ">= 0.0.0" };
}

export class StdlibLoader {
  private hexClient: HexClient;
  private cache: PackageCache;
  private debug: boolean;
  private config: StandardLibraryConfig;
  private loadedPackages: Set<string> = new Set();

  constructor(config: StandardLibraryConfig = {}, debug: boolean = false) {
    this.hexClient = new HexClient();
    this.cache = new PackageCache(config.cache);
    this.config = config;
    this.debug = debug;
  }

  /**
   * Load builtin packages based on preset
   */
  async loadBuiltinPackages(
    projectId: number,
    writeModule: WriteModuleFn,
    preset?: Preset,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    const packagesToLoad = preset ? getPresetPackages(preset) : [...BUILTIN_PACKAGE_NAMES];

    for (const packageName of packagesToLoad) {
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
   *
   * Package entries may name a Hex package, a git repository or a local
   * directory. Unless `resolve` is disabled, the whole closure is resolved
   * first so transitive dependencies come along at compatible versions.
   */
  async loadThirdPartyPackages(
    packages: (string | PackageConfig)[],
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    if (this.config.resolve === false) {
      return await this.loadThirdPartyPackagesUnresolved(packages, projectId, writeModule);
    }

    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    let roots: DependencySpec[];
    try {
      roots = packages.map(toDependencySpec);
    } catch (error) {
      result.errors.push(describeError(error));
      return result;
    }

    const filtersByPackage = new Map<string, { include?: string[]; exclude?: string[] }>();
    for (const pkg of packages) {
      if (typeof pkg !== "string" && (pkg.include || pkg.exclude)) {
        filtersByPackage.set(pkg.name, { include: pkg.include, exclude: pkg.exclude });
      }
    }

    let manifest;
    try {
      manifest = await resolveDependencies(roots, {
        baseDir: this.config.baseDir,
        provider: new DefaultDependencyProvider({
          registry: { cacheEnabled: this.config.cache?.enabled !== false },
          git: { onDebug: this.debug ? (message) => console.log(message) : undefined },
        }),
      });
    } catch (error) {
      result.errors.push(
        error instanceof ResolutionError
          ? `Dependency resolution failed: ${error.message}`
          : `Dependency resolution failed: ${describeError(error)}`,
      );
      return result;
    }

    if (this.debug) {
      console.log(
        `Resolved ${manifest.packages.length} packages: ${
          manifest.packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")
        }`,
      );
    }

    const fetcher = new PackageFetcher({
      hexClient: this.hexClient,
      cache: this.cache,
      onDebug: this.debug ? (message) => console.log(message) : undefined,
    });

    for (const pkg of manifest.packages) {
      // Builtins are already in the project; loading them twice would
      // overwrite modules the compiler has already seen.
      if (this.loadedPackages.has(pkg.name)) {
        if (this.debug) {
          console.log(`Skipping ${pkg.name} (already loaded)`);
        }
        continue;
      }

      try {
        const files = await fetcher.fetch(pkg);
        const written = this.writeSourceFiles(
          pkg.name,
          files,
          projectId,
          writeModule,
          filtersByPackage.get(pkg.name),
        );

        result.modules.push(...written.modules);
        result.ffiFiles.push(...written.ffiFiles);
        this.loadedPackages.add(pkg.name);

        if (this.debug) {
          console.log(
            `✓ Loaded ${written.modules.length} modules and ${written.ffiFiles.length} FFI files from ${pkg.name}@${pkg.version} (${pkg.source})`,
          );
        }
      } catch (error) {
        result.errors.push(`Failed to load package ${pkg.name}: ${describeError(error)}`);
      }
    }

    return result;
  }

  /**
   * Write extracted package files into the project, honouring filters.
   *
   * Hex tarballs, git trees and local directories all arrive in the same
   * shape, so the three sources load through this one path.
   */
  private writeSourceFiles(
    packageName: string,
    files: ExtractedFile[],
    projectId: number,
    writeModule: WriteModuleFn,
    filters?: { include?: string[]; exclude?: string[] },
  ): { modules: LoadedModule[]; ffiFiles: FFIFile[] } {
    const modules: LoadedModule[] = [];
    const ffiFiles: FFIFile[] = [];

    const keep = (candidate: string): boolean => {
      if (!filters) return true;
      if (filters.include && !filters.include.some((f) => moduleMatchesFilter(candidate, f))) {
        return false;
      }
      if (filters.exclude && filters.exclude.some((f) => moduleMatchesFilter(candidate, f))) {
        return false;
      }
      return true;
    };

    for (const file of files) {
      if (file.isFFI) {
        const ffiPath = file.path.replace(/^src\//, "");
        if (keep(ffiPath)) {
          ffiFiles.push({ path: ffiPath, content: file.content, packageName });
        }
        continue;
      }

      const moduleName = getModuleNameFromPath(file.path);
      if (!keep(moduleName)) continue;

      writeModule(projectId, moduleName, file.content);
      modules.push({ moduleName, code: file.content, packageName });
    }

    return { modules, ffiFiles };
  }

  /**
   * Load each listed package on its own, with no dependency resolution.
   *
   * Kept for `resolve: false`, where only what the config names is loaded.
   */
  private async loadThirdPartyPackagesUnresolved(
    packages: (string | PackageConfig)[],
    projectId: number,
    writeModule: WriteModuleFn,
  ): Promise<LoadResult> {
    const result: LoadResult = { modules: [], ffiFiles: [], errors: [] };

    for (const pkg of packages) {
      const packageName = typeof pkg === "string" ? pkg : pkg.name;
      const version = typeof pkg === "string" ? undefined : pkg.version;
      const filters = typeof pkg === "string"
        ? undefined
        : { include: pkg.include, exclude: pkg.exclude };

      if (typeof pkg !== "string" && (pkg.git || pkg.path)) {
        result.errors.push(
          `Package ${packageName} is a ${
            pkg.git ? "git" : "path"
          } dependency, which needs dependency resolution enabled`,
        );
        continue;
      }

      // Skip if already loaded as a builtin
      if (this.loadedPackages.has(packageName)) {
        if (this.debug) {
          console.log(`Skipping ${packageName} (already loaded)`);
        }
        continue;
      }

      try {
        const packageResult = await this.loadPackage(
          packageName,
          version,
          projectId,
          writeModule,
          filters,
        );
        result.modules.push(...packageResult.modules);
        result.ffiFiles.push(...packageResult.ffiFiles);
        result.errors.push(...packageResult.errors);
      } catch (error) {
        result.errors.push(`Failed to load package ${packageName}: ${describeError(error)}`);
      }
    }

    return result;
  }

  /**
   * Load all standard libraries (builtin + third-party)
   */
  async loadAll(
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

    // Resolve preset from config
    const preset = this.config.preset ?? DEFAULT_PRESET;

    // Load builtin packages based on preset
    const builtinResult = preset === "none"
      ? { modules: [], ffiFiles: [], errors: [] }
      : await this.loadBuiltinPackages(projectId, writeModule, preset);
    result.modules.push(...builtinResult.modules);
    result.ffiFiles.push(...builtinResult.ffiFiles);
    result.errors.push(...builtinResult.errors);

    // Load third-party packages if specified
    if (this.config.packages && this.config.packages.length > 0) {
      const thirdPartyResult = await this.loadThirdPartyPackages(
        this.config.packages,
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
        { path: "gleam_prelude.mjs", content: preludeContent, packageName: "gleam" },
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
    filters?: { include?: string[]; exclude?: string[] },
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
          result.ffiFiles.push({ path: moduleName, content: code, packageName });
        } else {
          writeModule(projectId, moduleName, code);
          result.modules.push({ moduleName, code, packageName });
        }
      }

      // Apply include/exclude filters on cached files
      const cachedFiltered: typeof result = { modules: [], ffiFiles: [], errors: [] };
      if (filters) {
        for (const item of result.modules) {
          if (
            filters.include && !filters.include.some((f) => moduleMatchesFilter(item.moduleName, f))
          ) continue;
          if (
            filters.exclude && filters.exclude.some((f) => moduleMatchesFilter(item.moduleName, f))
          ) continue;
          cachedFiltered.modules.push(item);
        }
        for (const item of result.ffiFiles) {
          if (filters.include && !filters.include.some((f) => moduleMatchesFilter(item.path, f))) {
            continue;
          }
          if (filters.exclude && filters.exclude.some((f) => moduleMatchesFilter(item.path, f))) {
            continue;
          }
          cachedFiltered.ffiFiles.push(item);
        }
        result.modules = cachedFiltered.modules;
        result.ffiFiles = cachedFiltered.ffiFiles;
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
        result.ffiFiles.push({ path: ffiPath, content: file.content, packageName });
        ffiCount++;
      } else {
        // Gleam module
        const moduleName = getModuleNameFromPath(file.path);
        writeModule(projectId, moduleName, file.content);
        result.modules.push({ moduleName, code: file.content, packageName });
        moduleCount++;
      }
    }

    // Apply include/exclude filters on extracted files
    if (filters) {
      const filteredModules = result.modules.filter((mod) => {
        if (
          filters.include && !filters.include.some((f) => moduleMatchesFilter(mod.moduleName, f))
        ) return false;
        if (
          filters.exclude && filters.exclude.some((f) => moduleMatchesFilter(mod.moduleName, f))
        ) return false;
        return true;
      });
      const filteredFFIs = result.ffiFiles.filter((ffi) => {
        if (filters.include && !filters.include.some((f) => moduleMatchesFilter(ffi.path, f))) {
          return false;
        }
        if (filters.exclude && filters.exclude.some((f) => moduleMatchesFilter(ffi.path, f))) {
          return false;
        }
        return true;
      });
      result.modules = filteredModules;
      result.ffiFiles = filteredFFIs;
    }

    this.loadedPackages.add(packageName);

    if (this.debug) {
      console.log(
        `✓ Loaded ${result.modules.length} modules and ${result.ffiFiles.length} FFI files from ${packageName}`,
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
