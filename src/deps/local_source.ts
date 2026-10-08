/**
 * Local path package source
 *
 * A path dependency is read straight from the filesystem. Its version and
 * requirements come from its own gleam.toml, and a relative path is resolved
 * against the directory of the gleam.toml that declared it, so nested path
 * dependencies keep working.
 */

import { isAbsolute, join, normalize, resolve } from "https://deno.land/std@0.220.0/path/mod.ts";
import { walk } from "https://deno.land/std@0.220.0/fs/mod.ts";
import type { ExtractedFile } from "../hex/tarball_extractor.ts";
import { type GleamToml, parseGleamToml } from "./gleam_toml.ts";

export class LocalSourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalSourceError";
  }
}

/** Resolve a dependency path against the directory that declared it. */
export function resolvePackagePath(path: string, baseDir: string): string {
  return isAbsolute(path) ? normalize(path) : resolve(baseDir, path);
}

export class LocalSource {
  private gleamTomls = new Map<string, GleamToml>();

  /** Read and parse the gleam.toml of a local package directory. */
  async readGleamToml(packageDir: string): Promise<GleamToml> {
    const cached = this.gleamTomls.get(packageDir);
    if (cached) return cached;

    const tomlPath = join(packageDir, "gleam.toml");

    let text: string;
    try {
      text = await Deno.readTextFile(tomlPath);
    } catch (error) {
      throw new LocalSourceError(`Cannot read ${tomlPath}: ${describe(error)}`, { cause: error });
    }

    const manifest = parseGleamToml(text);
    this.gleamTomls.set(packageDir, manifest);
    return manifest;
  }

  /**
   * Gleam sources and JavaScript FFI files under `src/`, in the same shape the
   * Hex tarball extractor produces so both sources load identically.
   */
  async readSourceFiles(packageDir: string): Promise<ExtractedFile[]> {
    const srcDir = join(packageDir, "src");
    const files: ExtractedFile[] = [];

    try {
      for await (
        const entry of walk(srcDir, { includeDirs: false, exts: [".gleam", ".mjs", ".js"] })
      ) {
        // Keep the "src/..." prefix the rest of the pipeline expects.
        const relative = entry.path.slice(packageDir.length).replace(/^[/\\]/, "").replaceAll(
          "\\",
          "/",
        );
        files.push({
          path: relative,
          content: await Deno.readTextFile(entry.path),
          isFFI: !entry.path.endsWith(".gleam"),
        });
      }
    } catch (error) {
      throw new LocalSourceError(`Cannot read sources under ${srcDir}: ${describe(error)}`, {
        cause: error,
      });
    }

    return files;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
