/**
 * Hex registry reader
 *
 * `https://repo.hex.pm/packages/<name>` serves a gzipped, signed protobuf
 * holding every release of a package together with its dependency
 * requirements. One CDN request per package replaces one API request per
 * version, which is what makes resolution affordable: sqlode's 33 releases
 * and all of their requirements arrive in 3.2 KB.
 *
 *   Signed     { bytes payload = 1; bytes signature = 2 }
 *    Package   { repeated Release releases = 1 }
 *     Release  { version = 1; inner_checksum = 2; dependencies = 3;
 *                retired = 4; outer_checksum = 5 }
 *      Dependency { package = 1; requirement = 2; optional = 3; app = 4;
 *                   repository = 5 }
 *
 * The signature is not verified here. Package contents are checked against
 * the checksum Hex publishes for the tarball instead.
 */

import { join } from "https://deno.land/std@0.220.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.220.0/fs/mod.ts";
import { getSubaruCacheDir } from "../setup.ts";
import { compareVersions, isPrerelease, parseVersion } from "./version.ts";

const HEX_REPO_BASE = "https://repo.hex.pm";
const DEFAULT_TTL = 60 * 60; // 1 hour, matching the registry's cache-control

export interface RegistryDependency {
  name: string;
  requirement: string;
  optional: boolean;
}

export interface RegistryRelease {
  version: string;
  dependencies: RegistryDependency[];
  retired: boolean;
  outerChecksum?: string;
}

export interface RegistryConfig {
  /** Mirror or private organisation base, e.g. "https://repo.hex.pm/repos/my_org" */
  baseUrl?: string;
  /** Auth key for a private Hex organisation */
  apiKey?: string;
  cacheEnabled?: boolean;
  cacheDir?: string;
  cacheTtl?: number;
}

interface CacheEntry {
  etag?: string;
  fetchedAt: number;
  releases: RegistryRelease[];
}

interface ProtoField {
  wire: number;
  bytes?: Uint8Array;
  varint?: bigint;
}

/** Decode a protobuf message into a field-number keyed map. */
function decodeFields(buffer: Uint8Array): Map<number, ProtoField[]> {
  const fields = new Map<number, ProtoField[]>();
  let offset = 0;

  const readVarint = (): bigint => {
    let value = 0n;
    let shift = 0n;
    while (offset < buffer.length) {
      const byte = buffer[offset++];
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    return value;
  };

  const push = (field: number, value: ProtoField) => {
    const existing = fields.get(field);
    if (existing) existing.push(value);
    else fields.set(field, [value]);
  };

  while (offset < buffer.length) {
    const key = Number(readVarint());
    const field = key >> 3;
    const wire = key & 7;

    switch (wire) {
      case 0:
        push(field, { wire, varint: readVarint() });
        break;
      case 1:
        offset += 8;
        break;
      case 2: {
        const length = Number(readVarint());
        push(field, { wire, bytes: buffer.subarray(offset, offset + length) });
        offset += length;
        break;
      }
      case 5:
        offset += 4;
        break;
      default:
        throw new Error(`Unsupported protobuf wire type ${wire}`);
    }
  }

  return fields;
}

const decoder = new TextDecoder();

function decodeString(bytes?: Uint8Array): string {
  return bytes ? decoder.decode(bytes) : "";
}

function decodeHex(bytes?: Uint8Array): string | undefined {
  if (!bytes) return undefined;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const input = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const stream = input.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decode a registry payload into releases, newest first. */
export function decodeRegistryPayload(data: Uint8Array): RegistryRelease[] {
  const signed = decodeFields(data);
  const payload = signed.get(1)?.[0].bytes ?? data;
  const pkg = decodeFields(payload);

  const releases = (pkg.get(1) ?? []).map((entry): RegistryRelease => {
    const release = decodeFields(entry.bytes!);
    return {
      version: decodeString(release.get(1)?.[0].bytes),
      retired: release.has(4),
      outerChecksum: decodeHex(release.get(5)?.[0].bytes),
      dependencies: (release.get(3) ?? []).map((dep): RegistryDependency => {
        const fields = decodeFields(dep.bytes!);
        return {
          name: decodeString(fields.get(1)?.[0].bytes),
          requirement: decodeString(fields.get(2)?.[0].bytes),
          optional: fields.get(3)?.[0].varint === 1n,
        };
      }),
    };
  });

  return releases.sort((a, b) => compareVersions(parseVersion(b.version), parseVersion(a.version)));
}

export class HexRegistry {
  private baseUrl: string;
  private apiKey?: string;
  private cacheEnabled: boolean;
  private cacheDir: string;
  private cacheTtl: number;
  private memory = new Map<string, RegistryRelease[]>();

  constructor(config: RegistryConfig = {}) {
    this.baseUrl = config.baseUrl ?? HEX_REPO_BASE;
    this.apiKey = config.apiKey;
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cacheDir = config.cacheDir ?? join(getSubaruCacheDir(), "registry");
    this.cacheTtl = config.cacheTtl ?? DEFAULT_TTL;
  }

  private cachePath(packageName: string): string {
    return join(this.cacheDir, `${packageName}.json`);
  }

  private async readCache(packageName: string): Promise<CacheEntry | undefined> {
    if (!this.cacheEnabled) return undefined;

    try {
      const text = await Deno.readTextFile(this.cachePath(packageName));
      return JSON.parse(text) as CacheEntry;
    } catch {
      return undefined;
    }
  }

  private async writeCache(packageName: string, entry: CacheEntry): Promise<void> {
    if (!this.cacheEnabled) return;

    try {
      await ensureDir(this.cacheDir);
      await Deno.writeTextFile(this.cachePath(packageName), JSON.stringify(entry));
    } catch {
      // A cache write failure must never fail resolution
    }
  }

  /**
   * All releases of a package, newest first.
   *
   * Served from memory, then from disk while fresh, then revalidated with the
   * stored ETag so an unchanged registry entry costs a 304.
   */
  async releases(packageName: string): Promise<RegistryRelease[]> {
    const cachedInMemory = this.memory.get(packageName);
    if (cachedInMemory) return cachedInMemory;

    const cached = await this.readCache(packageName);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtl * 1000) {
      this.memory.set(packageName, cached.releases);
      return cached.releases;
    }

    const headers: HeadersInit = {};
    if (cached?.etag) headers["if-none-match"] = cached.etag;
    if (this.apiKey) headers["authorization"] = this.apiKey;

    const response = await fetch(`${this.baseUrl}/packages/${packageName}`, { headers });

    if (response.status === 304 && cached) {
      await response.body?.cancel();
      await this.writeCache(packageName, { ...cached, fetchedAt: Date.now() });
      this.memory.set(packageName, cached.releases);
      return cached.releases;
    }

    if (response.status === 404) {
      await response.body?.cancel();
      throw new Error(`Package not found on Hex: ${packageName}`);
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Registry request for ${packageName} failed: HTTP ${response.status}`);
    }

    const releases = decodeRegistryPayload(
      await gunzip(new Uint8Array(await response.arrayBuffer())),
    );

    this.memory.set(packageName, releases);
    await this.writeCache(packageName, {
      etag: response.headers.get("etag") ?? undefined,
      fetchedAt: Date.now(),
      releases,
    });

    return releases;
  }

  /**
   * Releases eligible for resolution: published, not retired, and — unless the
   * caller opts in — not a pre-release.
   */
  async candidates(packageName: string, includePrereleases = false): Promise<RegistryRelease[]> {
    const releases = await this.releases(packageName);
    return releases.filter((release) => {
      if (release.retired) return false;
      if (includePrereleases) return true;
      return !isPrerelease(parseVersion(release.version));
    });
  }
}
