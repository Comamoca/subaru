/**
 * Hex.pm integration module
 *
 * Provides functionality for downloading and caching Hex.pm packages
 */

export {
  type ExtractedFile,
  extractHexTarball,
  type ExtractResult,
  getModuleNameFromPath,
} from "./tarball_extractor.ts";

export {
  HexClient,
  hexClient,
  type HexClientConfig,
  type HexPackageInfo,
  type HexRelease,
} from "./hex_client.ts";

export {
  type CacheMetadata,
  cleanPackageCache,
  getPackageCacheDir,
  PackageCache,
  packageCache,
  type PackageCacheConfig,
} from "./package_cache.ts";
