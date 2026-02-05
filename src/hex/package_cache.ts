/**
 * Package cache management
 *
 * Caches downloaded Hex packages to avoid repeated downloads
 */

import { join } from "https://deno.land/std@0.220.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.220.0/fs/mod.ts";
import { getSubaruCacheDir } from "../setup.ts";

export interface CacheMetadata {
  packageName: string;
  version: string;
  cachedAt: number; // Unix timestamp in milliseconds
  ttl: number; // TTL in seconds
  files: string[]; // List of cached file paths
}

export interface PackageCacheConfig {
  enabled?: boolean;
  directory?: string;
  ttl?: number; // TTL in seconds, default: 7 days
}

const DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const METADATA_FILENAME = ".meta.json";

export class PackageCache {
  private enabled: boolean;
  private directory: string;
  private ttl: number;

  constructor(config: PackageCacheConfig = {}) {
    this.enabled = config.enabled !== false; // Default to enabled
    this.directory = config.directory || join(getSubaruCacheDir(), "packages");
    this.ttl = config.ttl ?? DEFAULT_TTL;
  }

  /**
   * Get the cache directory path
   */
  getCacheDir(): string {
    return this.directory;
  }

  /**
   * Get the package directory path
   */
  private getPackageDir(packageName: string, version: string): string {
    return join(this.directory, packageName, version);
  }

  /**
   * Get the metadata file path for a package
   */
  private getMetadataPath(packageName: string, version: string): string {
    return join(this.getPackageDir(packageName, version), METADATA_FILENAME);
  }

  /**
   * Check if a package version is cached and valid
   */
  async has(packageName: string, version: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const metadata = await this.getMetadata(packageName, version);
      if (!metadata) return false;

      // Check if cache has expired
      const expiresAt = metadata.cachedAt + metadata.ttl * 1000;
      return Date.now() < expiresAt;
    } catch {
      return false;
    }
  }

  /**
   * Get cached metadata for a package
   */
  async getMetadata(packageName: string, version: string): Promise<CacheMetadata | null> {
    if (!this.enabled) return null;

    try {
      const metadataPath = this.getMetadataPath(packageName, version);
      const content = await Deno.readTextFile(metadataPath);
      return JSON.parse(content) as CacheMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Get cached files for a package
   *
   * @returns Map of module name to file content
   */
  async get(packageName: string, version: string): Promise<Map<string, string> | null> {
    if (!this.enabled) return null;

    if (!(await this.has(packageName, version))) {
      return null;
    }

    const metadata = await this.getMetadata(packageName, version);
    if (!metadata) return null;

    const files = new Map<string, string>();
    const packageDir = this.getPackageDir(packageName, version);

    for (const filePath of metadata.files) {
      try {
        const fullPath = join(packageDir, filePath);
        const content = await Deno.readTextFile(fullPath);

        // For .gleam files, convert to module name (e.g., "src/gleam/io.gleam" -> "gleam/io")
        // For FFI files (.mjs, .js), preserve the filename with extension
        let key: string;
        if (filePath.endsWith(".gleam")) {
          key = filePath.replace(/^src\//, "").replace(/\.gleam$/, "");
        } else {
          // FFI file - preserve filename with extension (e.g., "src/filepath_ffi.mjs" -> "filepath_ffi.mjs")
          key = filePath.replace(/^src\//, "");
        }

        files.set(key, content);
      } catch {
        // File missing, cache is corrupted
        await this.remove(packageName, version);
        return null;
      }
    }

    return files;
  }

  /**
   * Store files in the cache
   *
   * @param packageName - Package name
   * @param version - Package version
   * @param files - Map of file path (relative to package root) to content
   */
  async set(
    packageName: string,
    version: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    if (!this.enabled) return;

    const packageDir = this.getPackageDir(packageName, version);

    // Ensure package directory exists
    await ensureDir(packageDir);

    const filePaths: string[] = [];

    // Write all files
    for (const file of files) {
      const fullPath = join(packageDir, file.path);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

      await ensureDir(dir);
      await Deno.writeTextFile(fullPath, file.content);
      filePaths.push(file.path);
    }

    // Write metadata
    const metadata: CacheMetadata = {
      packageName,
      version,
      cachedAt: Date.now(),
      ttl: this.ttl,
      files: filePaths,
    };

    const metadataPath = this.getMetadataPath(packageName, version);
    await Deno.writeTextFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Remove a specific package version from cache
   */
  async remove(packageName: string, version: string): Promise<void> {
    if (!this.enabled) return;

    try {
      const packageDir = this.getPackageDir(packageName, version);
      await Deno.remove(packageDir, { recursive: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  }

  /**
   * Remove all versions of a package from cache
   */
  async removePackage(packageName: string): Promise<void> {
    if (!this.enabled) return;

    try {
      const packageDir = join(this.directory, packageName);
      await Deno.remove(packageDir, { recursive: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  }

  /**
   * Clear all cached packages
   */
  async clear(): Promise<void> {
    if (!this.enabled) return;

    try {
      await Deno.remove(this.directory, { recursive: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  }

  /**
   * List all cached packages
   */
  async list(): Promise<Array<{ packageName: string; version: string; metadata: CacheMetadata }>> {
    if (!this.enabled) return [];

    const packages: Array<{ packageName: string; version: string; metadata: CacheMetadata }> = [];

    try {
      for await (const packageEntry of Deno.readDir(this.directory)) {
        if (!packageEntry.isDirectory) continue;

        const packageDir = join(this.directory, packageEntry.name);

        for await (const versionEntry of Deno.readDir(packageDir)) {
          if (!versionEntry.isDirectory) continue;

          const metadata = await this.getMetadata(packageEntry.name, versionEntry.name);
          if (metadata) {
            packages.push({
              packageName: packageEntry.name,
              version: versionEntry.name,
              metadata,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return packages;
  }

  /**
   * Remove expired cache entries
   */
  async cleanup(): Promise<number> {
    if (!this.enabled) return 0;

    const now = Date.now();
    let removed = 0;

    const packages = await this.list();
    for (const pkg of packages) {
      const expiresAt = pkg.metadata.cachedAt + pkg.metadata.ttl * 1000;
      if (now >= expiresAt) {
        await this.remove(pkg.packageName, pkg.version);
        removed++;
      }
    }

    return removed;
  }
}

// Export a default instance for convenience
export const packageCache = new PackageCache();

/**
 * Get the package cache directory path
 */
export function getPackageCacheDir(): string {
  return join(getSubaruCacheDir(), "packages");
}

/**
 * Clean the package cache
 */
export async function cleanPackageCache(): Promise<void> {
  const cacheDir = getPackageCacheDir();
  console.log(`🗑️  Removing package cache: ${cacheDir}`);

  try {
    await Deno.remove(cacheDir, { recursive: true });
    console.log("✅ Package cache cleared successfully");
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log("ℹ️  Package cache directory does not exist");
    } else {
      throw error;
    }
  }
}
