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
  FALLBACK_GITHUB_URLS,
  getBuiltinPackage,
  isBuiltinPackage,
} from "./builtin_packages.ts";

export {
  createStdlibLoader,
  type LoadedModule,
  type LoadResult,
  type StandardLibraryConfig,
  StdlibLoader,
  type ThirdPartyPackage,
} from "./stdlib_loader.ts";
