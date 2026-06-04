/**
 * Standard library module
 *
 * Provides functionality for loading Gleam standard libraries
 */

export {
  BUILTIN_PACKAGE_MODULES,
  BUILTIN_PACKAGE_NAMES,
  BUILTIN_PACKAGES,
  type BuiltinPackage,
  type BuiltinPackageName,
  DEFAULT_PRESET,
  FALLBACK_GITHUB_URLS,
  getBuiltinPackage,
  getPresetPackages,
  isBuiltinPackage,
  type Preset,
  PRESET_PACKAGES,
} from "./builtin_packages.ts";

export {
  createStdlibLoader,
  type LoadedModule,
  type LoadResult,
  type PackageConfig,
  type StandardLibraryConfig,
  StdlibLoader,
  type ThirdPartyPackage,
} from "./stdlib_loader.ts";
