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
  buildFfiLayout,
  FFI_ROOT,
  type FfiEntry,
  type FfiLayout,
  namespaceFfiPath,
  rewriteCompiledFfiImports,
  rewriteFfiFile,
} from "./ffi_namespace.ts";

export {
  EXIT_SIGNAL_PREFIX,
  EXIT_TRAP_GLOBAL,
  isProcessSpecifier,
  parseExitStatus,
  PROCESS_SHIM_FILE,
  PROCESS_SHIM_PACKAGE,
  PROCESS_SHIM_SOURCE,
} from "./process_shim.ts";

export {
  createStdlibLoader,
  type FFIFile,
  type LoadedModule,
  type LoadResult,
  type PackageConfig,
  type StandardLibraryConfig,
  StdlibLoader,
  type ThirdPartyPackage,
} from "./stdlib_loader.ts";
