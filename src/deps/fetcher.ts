/**
 * Package fetching for resolved manifests
 *
 * Turns a resolved package into Gleam sources and JavaScript FFI files,
 * whichever source it came from. Hex packages keep using the existing tarball
 * cache; git packages come out of the cached clone; path packages are read in
 * place and never cached, so edits to a local dependency take effect at once.
 */

import { type ExtractedFile, extractHexTarball, HexClient, PackageCache } from "../hex/mod.ts";
import type { PackageCacheConfig } from "../hex/package_cache.ts";
import { GitSource, type GitSourceConfig } from "./git_source.ts";
import { LocalSource } from "./local_source.ts";
import type { ResolvedPackage } from "./resolver.ts";

export interface PackageFetcherConfig {
  hexClient?: HexClient;
  cache?: PackageCacheConfig | PackageCache;
  git?: GitSourceConfig | GitSource;
  local?: LocalSource;
  onDebug?: (message: string) => void;
}

export class PackageFetcher {
  private hexClient: HexClient;
  private cache: PackageCache;
  private gitSource: GitSource;
  private localSource: LocalSource;
  private onDebug?: (message: string) => void;

  constructor(config: PackageFetcherConfig = {}) {
    this.hexClient = config.hexClient ?? new HexClient();
    this.cache = config.cache instanceof PackageCache
      ? config.cache
      : new PackageCache(config.cache);
    this.gitSource = config.git instanceof GitSource ? config.git : new GitSource(config.git);
    this.localSource = config.local ?? new LocalSource();
    this.onDebug = config.onDebug;
  }

  /** Gleam sources and FFI files of one resolved package. */
  async fetch(pkg: ResolvedPackage): Promise<ExtractedFile[]> {
    switch (pkg.locator.source) {
      case "hex":
        return await this.fetchHex(pkg.name, pkg.version);
      case "git":
        return await this.gitSource.readSourceFiles(
          pkg.locator.repo,
          pkg.locator.commit,
          pkg.locator.ref,
        );
      case "local":
        return await this.localSource.readSourceFiles(pkg.locator.path);
    }
  }

  private async fetchHex(name: string, version: string): Promise<ExtractedFile[]> {
    const cached = await this.cache.get(name, version);
    if (cached) {
      this.onDebug?.(`Using cached ${name}@${version}`);

      // The cache stores module names and FFI filenames, not tarball paths.
      return [...cached].map(([key, content]) => {
        const isFFI = key.endsWith(".mjs") || key.endsWith(".js");
        return {
          path: isFFI ? `src/${key}` : `src/${key}.gleam`,
          content,
          isFFI,
        };
      });
    }

    this.onDebug?.(`Downloading ${name}@${version} from Hex.pm`);
    const tarball = await this.hexClient.downloadTarball(name, version);
    const extracted = await extractHexTarball(tarball);
    await this.cache.set(name, version, extracted.files);

    return extracted.files;
  }
}
