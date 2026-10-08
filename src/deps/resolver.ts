/**
 * Dependency resolver for hex, git and local packages
 *
 * The Gleam compiler resolves with pubgrub. Its WASM build does not expose
 * that (it exports only the compile/filesystem entry points), so resolution
 * happens here instead.
 *
 * The search below is a backtracking one that prefers the highest version, the
 * same preference pubgrub applies. On the two graphs used as references —
 * sqlode (13 packages) and lustre + wisp + mist (23 packages) — it produces
 * exactly the versions `gleam deps download` writes into manifest.toml.
 *
 * The one trap worth naming: a constraint discovered late can invalidate a
 * package decided earlier. Without re-checking those, the search returns a
 * solution that looks fine and is not — on the lustre graph it picked
 * lustre 5.7.1 next to gleam_erlang 0.34.0, which lustre forbids. Every
 * candidate therefore re-validates the already-decided packages.
 *
 * Versions are only negotiated for hex packages. A git or local dependency
 * contributes exactly one candidate, pinned by its commit or its path, and its
 * requirements come from its own gleam.toml.
 */

import { dirname } from "https://deno.land/std@0.220.0/path/mod.ts";
import type { DependencySpec } from "./gleam_toml.ts";
import { HexRegistry, type RegistryConfig } from "./registry.ts";
import { GitSource, type GitSourceConfig } from "./git_source.ts";
import { LocalSource, resolvePackagePath } from "./local_source.ts";
import { compareVersions, parseRequirement, parseVersion, type Requirement } from "./version.ts";

export type SourceKind = "hex" | "git" | "local";

export interface HexLocator {
  source: "hex";
  outerChecksum?: string;
}

export interface GitLocator {
  source: "git";
  repo: string;
  ref: string;
  commit: string;
}

export interface LocalLocator {
  source: "local";
  path: string;
}

export type Locator = HexLocator | GitLocator | LocalLocator;

/** One resolvable version of a package, with the dependencies it pulls in. */
export interface Candidate {
  version: string;
  dependencies: DependencySpec[];
  locator: Locator;
  /**
   * Directory that relative path dependencies of this candidate resolve
   * against. Only local packages have one.
   */
  baseDir?: string;
}

export interface DependencyProvider {
  /** Eligible hex releases, newest first. */
  hexCandidates(name: string): Promise<Candidate[]>;
  gitCandidate(url: string, ref: string): Promise<Candidate>;
  localCandidate(path: string, baseDir: string): Promise<Candidate>;
}

export interface ResolvedPackage {
  name: string;
  version: string;
  source: SourceKind;
  locator: Locator;
  /** Names of the non-optional dependencies, as gleam's manifest records them. */
  requirements: string[];
}

export interface Manifest {
  packages: ResolvedPackage[];
  /** The root requirements the manifest was resolved from. */
  requirements: DependencySpec[];
}

export class ResolutionError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(details.length > 0 ? `${message}\n${details.map((d) => `  ${d}`).join("\n")}` : message);
    this.name = "ResolutionError";
  }
}

export interface ResolveOptions {
  /** Directory that relative root path dependencies resolve against. */
  baseDir?: string;
  provider?: DependencyProvider;
  /** Hard cap on explored candidates, as a guard against pathological graphs. */
  maxSteps?: number;
}

interface Constraint {
  requirement: Requirement;
  /** Who asked for it, e.g. "glint@1.3.0" or "root" */
  from: string;
}

/** A non-hex source pins where a package comes from; two pins must agree. */
interface Pin {
  spec: Extract<DependencySpec, { source: "git" } | { source: "local" }>;
  baseDir: string;
  from: string;
}

function describeSpec(spec: DependencySpec): string {
  switch (spec.source) {
    case "hex":
      return `hex ${spec.requirement}`;
    case "git":
      return `git ${spec.url}#${spec.ref}`;
    case "local":
      return `path ${spec.path}`;
  }
}

function samePin(a: Pin["spec"], b: Pin["spec"]): boolean {
  if (a.source !== b.source) return false;
  if (a.source === "git" && b.source === "git") return a.url === b.url && a.ref === b.ref;
  if (a.source === "local" && b.source === "local") return a.path === b.path;
  return false;
}

/**
 * Resolve a set of root requirements into a manifest.
 *
 * Root requirements are the same shape as gleam.toml dependency entries, so a
 * project's `[dependencies]` table can be passed straight through.
 */
export async function resolve(
  roots: DependencySpec[],
  options: ResolveOptions = {},
): Promise<Manifest> {
  const baseDir = options.baseDir ?? Deno.cwd();
  const provider = options.provider ?? new DefaultDependencyProvider();
  const maxSteps = options.maxSteps ?? 20000;

  const constraints = new Map<string, Constraint[]>();
  const pins = new Map<string, Pin>();
  const chosen = new Map<string, Candidate>();
  const candidateCache = new Map<string, Candidate[]>();

  /** Constraints that were live when the search last ran out of options. */
  let deepestFailure: { name: string; details: string[] } | undefined;
  let steps = 0;

  const addSpec = (spec: DependencySpec, from: string, specBaseDir: string): () => void => {
    if (spec.source === "hex") {
      const list = constraints.get(spec.name) ?? [];
      list.push({ requirement: parseRequirement(spec.requirement), from });
      constraints.set(spec.name, list);

      return () => {
        const current = constraints.get(spec.name);
        if (!current) return;
        current.pop();
        if (current.length === 0) constraints.delete(spec.name);
      };
    }

    const existing = pins.get(spec.name);
    if (existing) {
      if (!samePin(existing.spec, spec)) {
        throw new ResolutionError(`Conflicting sources for ${spec.name}`, [
          `${existing.from} requires ${describeSpec(existing.spec)}`,
          `${from} requires ${describeSpec(spec)}`,
        ]);
      }
      return () => {};
    }

    pins.set(spec.name, { spec, baseDir: specBaseDir, from });
    if (!constraints.has(spec.name)) constraints.set(spec.name, []);

    return () => {
      pins.delete(spec.name);
      const current = constraints.get(spec.name);
      if (current && current.length === 0) constraints.delete(spec.name);
    };
  };

  const candidatesFor = async (name: string): Promise<Candidate[]> => {
    const pin = pins.get(name);
    const key = pin ? `${name}:${describeSpec(pin.spec)}` : `${name}:hex`;

    const cached = candidateCache.get(key);
    if (cached) return cached;

    let candidates: Candidate[];
    if (!pin) {
      candidates = await provider.hexCandidates(name);
    } else if (pin.spec.source === "git") {
      candidates = [await provider.gitCandidate(pin.spec.url, pin.spec.ref)];
    } else {
      candidates = [await provider.localCandidate(pin.spec.path, pin.baseDir)];
    }

    candidateCache.set(key, candidates);
    return candidates;
  };

  /** Candidates of `name` that satisfy every constraint currently recorded. */
  const viableFor = async (name: string): Promise<Candidate[]> => {
    const applicable = constraints.get(name) ?? [];
    const candidates = await candidatesFor(name);

    if (applicable.length === 0) return candidates;

    return candidates.filter((candidate) => {
      const version = parseVersion(candidate.version);
      return applicable.every((constraint) => constraint.requirement.satisfies(version));
    });
  };

  const explain = (name: string): string[] => {
    const applicable = constraints.get(name) ?? [];
    const pin = pins.get(name);
    const details = applicable.map((c) => `${c.from} requires ${name} ${c.requirement.source}`);
    if (pin) details.unshift(`${pin.from} requires ${name} from ${describeSpec(pin.spec)}`);
    return details;
  };

  const search = async (): Promise<boolean> => {
    const pending = [...constraints.keys()].filter((name) => !chosen.has(name));
    if (pending.length === 0) return true;

    if (++steps > maxSteps) {
      throw new ResolutionError(
        `Dependency resolution gave up after ${maxSteps} steps`,
        pending.map((name) => `unresolved: ${name}`),
      );
    }

    // Decide the most constrained package first so dead ends surface early.
    const ranked: { name: string; candidates: Candidate[] }[] = [];
    for (const name of pending) {
      ranked.push({ name, candidates: await viableFor(name) });
    }
    ranked.sort((a, b) => a.candidates.length - b.candidates.length);

    const { name, candidates } = ranked[0];
    if (candidates.length === 0) {
      deepestFailure = { name, details: explain(name) };
      return false;
    }

    const ordered = [...candidates].sort((a, b) =>
      compareVersions(parseVersion(b.version), parseVersion(a.version))
    );

    for (const candidate of ordered) {
      chosen.set(name, candidate);

      const undo: (() => void)[] = [];
      let consistent = true;

      for (const spec of candidate.dependencies) {
        const specBaseDir = candidate.baseDir ?? baseDir;
        undo.push(addSpec(spec, `${name}@${candidate.version}`, specBaseDir));

        // A late constraint can contradict an earlier decision; checking here
        // is what keeps the returned solution valid.
        const decided = chosen.get(spec.name);
        if (
          decided && spec.source === "hex" &&
          !parseRequirement(spec.requirement).satisfies(parseVersion(decided.version))
        ) {
          deepestFailure = {
            name: spec.name,
            details: [
              ...explain(spec.name),
              `already chose ${spec.name}@${decided.version}`,
            ],
          };
          consistent = false;
          break;
        }
        if (decided && spec.source !== "hex" && decided.locator.source !== spec.source) {
          consistent = false;
          break;
        }
      }

      if (consistent && await search()) return true;

      for (const revert of undo.reverse()) revert();
      chosen.delete(name);
    }

    return false;
  };

  const rootUndo: (() => void)[] = [];
  for (const spec of roots) {
    rootUndo.push(addSpec(spec, "root", baseDir));
  }

  if (!await search()) {
    const failure = deepestFailure;
    throw new ResolutionError(
      failure ? `No version of ${failure.name} satisfies all requirements` : "No solution found",
      failure?.details ?? [],
    );
  }

  const packages: ResolvedPackage[] = [...chosen.entries()]
    .map(([name, candidate]) => ({
      name,
      version: candidate.version,
      source: candidate.locator.source,
      locator: candidate.locator,
      requirements: candidate.dependencies.map((spec) => spec.name).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { packages, requirements: roots };
}

/**
 * The provider used in production: Hex registry for hex packages,
 * isomorphic-git for git packages, the filesystem for path packages.
 */
export class DefaultDependencyProvider implements DependencyProvider {
  private registry: HexRegistry;
  private gitSource: GitSource;
  private localSource: LocalSource;
  private includePrereleases: boolean;

  constructor(
    options: {
      registry?: RegistryConfig | HexRegistry;
      git?: GitSourceConfig | GitSource;
      local?: LocalSource;
      includePrereleases?: boolean;
    } = {},
  ) {
    this.registry = options.registry instanceof HexRegistry
      ? options.registry
      : new HexRegistry(options.registry);
    this.gitSource = options.git instanceof GitSource ? options.git : new GitSource(options.git);
    this.localSource = options.local ?? new LocalSource();
    this.includePrereleases = options.includePrereleases ?? false;
  }

  async hexCandidates(name: string): Promise<Candidate[]> {
    const releases = await this.registry.candidates(name, this.includePrereleases);

    return releases.map((release) => ({
      version: release.version,
      locator: { source: "hex", outerChecksum: release.outerChecksum },
      dependencies: release.dependencies
        .filter((dependency) => !dependency.optional)
        .map((dependency) => ({
          source: "hex" as const,
          name: dependency.name,
          requirement: dependency.requirement,
        })),
    }));
  }

  async gitCandidate(url: string, ref: string): Promise<Candidate> {
    const commit = await this.gitSource.resolveRef(url, ref);
    const manifest = await this.gitSource.readGleamToml(url, commit, ref);

    return {
      version: manifest.version,
      locator: { source: "git", repo: url, ref, commit },
      dependencies: manifest.dependencies,
    };
  }

  async localCandidate(path: string, baseDir: string): Promise<Candidate> {
    const packageDir = resolvePackagePath(path, baseDir);
    const manifest = await this.localSource.readGleamToml(packageDir);

    return {
      version: manifest.version,
      locator: { source: "local", path: packageDir },
      dependencies: manifest.dependencies,
      // Nested path dependencies are relative to this package's own directory.
      baseDir: packageDir,
    };
  }
}

/** Resolve the dependencies declared by a gleam.toml on disk. */
export async function resolveFromGleamToml(
  tomlPath: string,
  options: ResolveOptions = {},
): Promise<Manifest> {
  const { parseGleamToml } = await import("./gleam_toml.ts");
  const manifest = parseGleamToml(await Deno.readTextFile(tomlPath));

  return resolve(manifest.dependencies, { baseDir: dirname(tomlPath), ...options });
}
