/**
 * Hex.pm API client
 *
 * Provides methods to interact with Hex.pm package registry
 */

export interface HexPackageInfo {
  name: string;
  latestVersion: string;
  releases: HexRelease[];
}

export interface HexRelease {
  version: string;
  url: string;
  insertedAt: string;
}

export interface HexClientConfig {
  maxRetries?: number;
  baseRetryDelay?: number;
  timeout?: number;
}

const DEFAULT_CONFIG: Required<HexClientConfig> = {
  maxRetries: 3,
  baseRetryDelay: 1000, // 1 second
  timeout: 30000, // 30 seconds
};

const HEX_API_BASE = "https://hex.pm/api";
const HEX_REPO_BASE = "https://repo.hex.pm";

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic using exponential backoff
 */
async function fetchWithRetry(
  url: string,
  config: Required<HexClientConfig>,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Retry on server errors or rate limiting
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort errors from timeout
      if (lastError.name === "AbortError") {
        throw new Error(`Request timeout after ${config.timeout}ms`);
      }
    }

    // Exponential backoff: 1s, 2s, 4s, ...
    if (attempt < config.maxRetries - 1) {
      const delay = config.baseRetryDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError || new Error("Unknown fetch error");
}

export class HexClient {
  private config: Required<HexClientConfig>;

  constructor(config: HexClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get package information from Hex.pm API
   */
  async getPackageInfo(packageName: string): Promise<HexPackageInfo> {
    const url = `${HEX_API_BASE}/packages/${packageName}`;
    const response = await fetchWithRetry(url, this.config);

    const data = await response.json();

    // Extract relevant information
    const releases: HexRelease[] = data.releases.map(
      (release: { version: string; url: string; inserted_at: string }) => ({
        version: release.version,
        url: release.url,
        insertedAt: release.inserted_at,
      }),
    );

    // Sort releases by version (newest first)
    releases.sort((a, b) => compareVersions(b.version, a.version));

    return {
      name: data.name,
      latestVersion: releases[0]?.version || "",
      releases,
    };
  }

  /**
   * Get the latest stable version of a package
   */
  async getLatestVersion(packageName: string): Promise<string> {
    const info = await this.getPackageInfo(packageName);

    // Find the latest stable version (no pre-release tags)
    const stableRelease = info.releases.find((release) => !isPreRelease(release.version));

    return stableRelease?.version || info.latestVersion;
  }

  /**
   * Download a package tarball from Hex.pm
   */
  async downloadTarball(packageName: string, version: string): Promise<Uint8Array> {
    const url = `${HEX_REPO_BASE}/tarballs/${packageName}-${version}.tar`;
    const response = await fetchWithRetry(url, this.config);

    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Download the latest version of a package
   */
  async downloadLatest(packageName: string): Promise<{ version: string; tarball: Uint8Array }> {
    const version = await this.getLatestVersion(packageName);
    const tarball = await this.downloadTarball(packageName, version);

    return { version, tarball };
  }
}

/**
 * Check if a version string indicates a pre-release
 */
function isPreRelease(version: string): boolean {
  return /[-+]/.test(version) ||
    /alpha|beta|rc|dev|pre/i.test(version);
}

/**
 * Compare two semver-like version strings
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const partsB = b.split(/[.-]/).map((p) => parseInt(p, 10) || 0);

  const maxLength = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLength; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA !== partB) {
      return partA - partB;
    }
  }

  return 0;
}

// Export a default instance for convenience
export const hexClient = new HexClient();
