/**
 * Git package source
 *
 * Git dependencies have no registry entry, so their version and requirements
 * are read from the gleam.toml inside the repository. Git access goes through
 * isomorphic-git, which keeps the resolver free of a `git` binary dependency.
 *
 * Repositories are cloned with `depth: 1` and no checkout: the objects for one
 * commit are enough to read gleam.toml and the sources out of the tree, and
 * nothing is written into a working directory.
 */

import git from "isomorphic-git";
import http from "isomorphic-git/http";
import fs from "node:fs";
import { join } from "https://deno.land/std@0.220.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.220.0/fs/mod.ts";
import { getSubaruCacheDir } from "../setup.ts";
import type { ExtractedFile } from "../hex/tarball_extractor.ts";
import { type GleamToml, parseGleamToml } from "./gleam_toml.ts";

const COMMIT_RE = /^[0-9a-f]{40}$/i;

export interface GitSourceConfig {
  cacheDir?: string;
  /** Called with progress messages when debugging is on */
  onDebug?: (message: string) => void;
}

export class GitSourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GitSourceError";
  }
}

/** Turn a clone URL into a filesystem-safe cache directory name. */
export function repoSlug(url: string): string {
  return url
    .replace(/^[a-z+]+:\/\//i, "")
    .replace(/\.git$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
}

export class GitSource {
  private cacheDir: string;
  private onDebug?: (message: string) => void;
  private gleamTomls = new Map<string, GleamToml>();

  constructor(config: GitSourceConfig = {}) {
    this.cacheDir = config.cacheDir ?? join(getSubaruCacheDir(), "git");
    this.onDebug = config.onDebug;
  }

  private debug(message: string): void {
    this.onDebug?.(message);
  }

  /**
   * Resolve a ref (branch, tag or commit) to a commit id.
   *
   * Branch and tag names are resolved over the wire with no clone at all, so
   * resolution can pin a commit before deciding to download anything.
   */
  async resolveRef(url: string, ref: string): Promise<string> {
    if (COMMIT_RE.test(ref)) return ref.toLowerCase();

    for (const prefix of [`refs/heads/${ref}`, `refs/tags/${ref}`]) {
      try {
        const refs = await git.listServerRefs({ http, url, prefix, symrefs: true });
        const match = refs.find((entry) => entry.ref === prefix);
        if (match) {
          this.debug(`Resolved ${url}#${ref} to ${match.oid}`);
          return match.oid;
        }
      } catch (error) {
        throw new GitSourceError(`Failed to list refs of ${url}: ${describe(error)}`, {
          cause: error,
        });
      }
    }

    throw new GitSourceError(`Ref "${ref}" not found in ${url}`);
  }

  private repoDir(url: string, commit: string): string {
    return join(this.cacheDir, repoSlug(url), commit);
  }

  /**
   * Make sure the objects for one commit are available locally, and return the
   * directory holding them. Already-cloned commits are reused as-is: a commit
   * id is immutable, so there is nothing to revalidate.
   */
  private async ensureRepo(url: string, commit: string, ref?: string): Promise<string> {
    const dir = this.repoDir(url, commit);

    try {
      await Deno.stat(join(dir, ".git"));
      this.debug(`Using cached clone of ${url}@${commit.slice(0, 8)}`);
      return dir;
    } catch {
      // Not cloned yet
    }

    await ensureDir(dir);
    this.debug(`Cloning ${url}@${commit.slice(0, 8)}...`);

    const clone = (target: string) =>
      git.clone({
        fs,
        http,
        dir,
        url,
        ref: target,
        depth: 1,
        singleBranch: true,
        noCheckout: true,
        noTags: true,
      });

    try {
      // Most servers (GitHub among them) serve a commit id directly.
      await clone(commit);
    } catch (commitError) {
      if (!ref || ref === commit) {
        await Deno.remove(dir, { recursive: true }).catch(() => {});
        throw new GitSourceError(
          `Failed to clone ${url} at ${commit}: ${describe(commitError)}`,
          { cause: commitError },
        );
      }

      // Fall back to the named ref for servers that refuse commit ids.
      try {
        await clone(ref);
      } catch (refError) {
        await Deno.remove(dir, { recursive: true }).catch(() => {});
        throw new GitSourceError(`Failed to clone ${url} at ${ref}: ${describe(refError)}`, {
          cause: refError,
        });
      }
    }

    return dir;
  }

  private async readBlobText(dir: string, commit: string, filepath: string): Promise<string> {
    const { blob } = await git.readBlob({ fs, dir, oid: commit, filepath });
    return new TextDecoder().decode(blob);
  }

  /** Read and parse the gleam.toml of a commit. */
  async readGleamToml(url: string, commit: string, ref?: string): Promise<GleamToml> {
    const key = `${url}@${commit}`;
    const cached = this.gleamTomls.get(key);
    if (cached) return cached;

    const dir = await this.ensureRepo(url, commit, ref);

    let text: string;
    try {
      text = await this.readBlobText(dir, commit, "gleam.toml");
    } catch (error) {
      throw new GitSourceError(`No gleam.toml in ${url}@${commit}: ${describe(error)}`, {
        cause: error,
      });
    }

    const manifest = parseGleamToml(text);
    this.gleamTomls.set(key, manifest);
    return manifest;
  }

  /**
   * Gleam sources and JavaScript FFI files under `src/`, in the same shape the
   * Hex tarball extractor produces so both sources load identically.
   */
  async readSourceFiles(url: string, commit: string, ref?: string): Promise<ExtractedFile[]> {
    const dir = await this.ensureRepo(url, commit, ref);

    let paths: string[];
    try {
      paths = await git.listFiles({ fs, dir, ref: commit });
    } catch (error) {
      throw new GitSourceError(`Failed to list files of ${url}@${commit}: ${describe(error)}`, {
        cause: error,
      });
    }

    const wanted = paths.filter((path) =>
      path.startsWith("src/") &&
      (path.endsWith(".gleam") || path.endsWith(".mjs") || path.endsWith(".js"))
    );

    const files: ExtractedFile[] = [];
    for (const path of wanted) {
      files.push({
        path,
        content: await this.readBlobText(dir, commit, path),
        isFFI: !path.endsWith(".gleam"),
      });
    }

    return files;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
