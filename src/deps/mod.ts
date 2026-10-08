/**
 * Dependency resolution module
 *
 * Resolves hex, git and local Gleam packages into a manifest, and fetches the
 * sources of whatever it resolved.
 */

export {
  compareVersions,
  formatVersion,
  isPrerelease,
  parseRequirement,
  parseVersion,
  type Requirement,
  satisfies,
  type Version,
  VersionError,
} from "./version.ts";

export {
  type DenoPermissions,
  type DependencySpec,
  type GleamToml,
  GleamTomlError,
  parseGleamToml,
} from "./gleam_toml.ts";

export {
  decodeRegistryPayload,
  HexRegistry,
  type RegistryConfig,
  type RegistryDependency,
  type RegistryRelease,
} from "./registry.ts";

export { GitSource, type GitSourceConfig, GitSourceError, repoSlug } from "./git_source.ts";

export { LocalSource, LocalSourceError, resolvePackagePath } from "./local_source.ts";

export {
  type Candidate,
  DefaultDependencyProvider,
  type DependencyProvider,
  type GitLocator,
  type HexLocator,
  type LocalLocator,
  type Locator,
  type Manifest,
  ResolutionError,
  resolve,
  type ResolvedPackage,
  resolveFromGleamToml,
  type ResolveOptions,
  type SourceKind,
} from "./resolver.ts";

export { PackageFetcher, type PackageFetcherConfig } from "./fetcher.ts";
