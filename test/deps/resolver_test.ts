import { assertEquals, assertRejects } from "https://deno.land/std@0.218.0/assert/mod.ts";
import type { DependencySpec } from "../../src/deps/gleam_toml.ts";
import {
  type Candidate,
  type DependencyProvider,
  type Manifest,
  ResolutionError,
  resolve,
} from "../../src/deps/resolver.ts";
import { parseRequirement, parseVersion } from "../../src/deps/version.ts";

/** A registry held in memory, so these tests never touch the network. */
interface StubRelease {
  version: string;
  deps?: Record<string, string>;
}

class StubProvider implements DependencyProvider {
  constructor(
    private hex: Record<string, StubRelease[]>,
    private git: Record<string, { version: string; deps?: DependencySpec[] }> = {},
    private local: Record<string, { version: string; deps?: DependencySpec[] }> = {},
  ) {}

  hexCandidates(name: string): Promise<Candidate[]> {
    const releases = this.hex[name];
    if (!releases) return Promise.reject(new Error(`Package not found on Hex: ${name}`));

    return Promise.resolve(releases.map((release) => ({
      version: release.version,
      locator: { source: "hex" as const },
      dependencies: Object.entries(release.deps ?? {}).map(([depName, requirement]) => ({
        source: "hex" as const,
        name: depName,
        requirement,
      })),
    })));
  }

  gitCandidate(url: string, ref: string): Promise<Candidate> {
    const entry = this.git[`${url}#${ref}`];
    if (!entry) return Promise.reject(new Error(`No stub git repo for ${url}#${ref}`));

    return Promise.resolve({
      version: entry.version,
      locator: { source: "git" as const, repo: url, ref, commit: "f".repeat(40) },
      dependencies: entry.deps ?? [],
    });
  }

  localCandidate(path: string, baseDir: string): Promise<Candidate> {
    const entry = this.local[path];
    if (!entry) return Promise.reject(new Error(`No stub local package at ${path}`));

    return Promise.resolve({
      version: entry.version,
      locator: { source: "local" as const, path: `${baseDir}/${path}` },
      dependencies: entry.deps ?? [],
      baseDir: `${baseDir}/${path}`,
    });
  }
}

function versionsOf(manifest: Manifest): Record<string, string> {
  return Object.fromEntries(manifest.packages.map((pkg) => [pkg.name, pkg.version]));
}

/** Every requirement in the solution must hold for the versions chosen. */
function assertConsistent(manifest: Manifest, provider: StubProvider): Promise<void> {
  const chosen = versionsOf(manifest);

  return Promise.all(manifest.packages.map(async (pkg) => {
    if (pkg.source !== "hex") return;

    const candidates = await provider.hexCandidates(pkg.name);
    const candidate = candidates.find((entry) => entry.version === pkg.version);
    assertEquals(candidate !== undefined, true, `${pkg.name}@${pkg.version} exists`);

    for (const spec of candidate!.dependencies) {
      if (spec.source !== "hex") continue;
      const got = chosen[spec.name];
      assertEquals(got !== undefined, true, `${spec.name} required by ${pkg.name} is present`);
      assertEquals(
        parseRequirement(spec.requirement).satisfies(parseVersion(got)),
        true,
        `${pkg.name}@${pkg.version} requires ${spec.name} ${spec.requirement}, got ${got}`,
      );
    }
  })).then(() => undefined);
}

Deno.test("resolve - transitive hex graph picks the highest satisfying versions", async () => {
  const provider = new StubProvider({
    app: [{ version: "1.0.0", deps: { lib: ">= 1.0.0 and < 2.0.0" } }],
    lib: [
      { version: "2.0.0" },
      { version: "1.4.0", deps: { helper: "~> 1.0" } },
      { version: "1.0.0" },
    ],
    helper: [{ version: "1.3.0" }, { version: "1.0.0" }],
  });

  const manifest = await resolve(
    [{ source: "hex", name: "app", requirement: ">= 1.0.0" }],
    { provider },
  );

  assertEquals(versionsOf(manifest), { app: "1.0.0", lib: "1.4.0", helper: "1.3.0" });
  await assertConsistent(manifest, provider);
});

Deno.test("resolve - backtracks when a late constraint contradicts a decision", async () => {
  // The resolver decides `lib` first because the root pins it to a single
  // candidate. app@2.0.0 then demands a newer lib, so it has to fall back to
  // app@1.0.0. Skipping that re-check is what once produced solutions that
  // were internally inconsistent.
  const provider = new StubProvider({
    app: [
      { version: "2.0.0", deps: { lib: ">= 1.0.0" } },
      { version: "1.0.0", deps: { lib: ">= 0.1.0" } },
    ],
    lib: [{ version: "1.0.0" }, { version: "0.5.0" }],
  });

  const manifest = await resolve([
    { source: "hex", name: "app", requirement: ">= 1.0.0" },
    { source: "hex", name: "lib", requirement: "< 1.0.0" },
  ], { provider });

  assertEquals(versionsOf(manifest), { app: "1.0.0", lib: "0.5.0" });
  await assertConsistent(manifest, provider);
});

Deno.test("resolve - git dependency is pinned and contributes its requirements", async () => {
  const provider = new StubProvider(
    { gleam_stdlib: [{ version: "1.0.5" }, { version: "0.9.0" }] },
    {
      "https://github.com/lpil/argv#main": {
        version: "1.1.0",
        deps: [{ source: "hex", name: "gleam_stdlib", requirement: ">= 0.9.0 and < 1.0.0" }],
      },
    },
  );

  const manifest = await resolve(
    [{ source: "git", name: "argv", url: "https://github.com/lpil/argv", ref: "main" }],
    { provider },
  );

  assertEquals(versionsOf(manifest), { argv: "1.1.0", gleam_stdlib: "0.9.0" });

  const argv = manifest.packages.find((pkg) => pkg.name === "argv")!;
  assertEquals(argv.source, "git");
  assertEquals(argv.locator, {
    source: "git",
    repo: "https://github.com/lpil/argv",
    ref: "main",
    commit: "f".repeat(40),
  });
  assertEquals(argv.requirements, ["gleam_stdlib"]);
});

Deno.test("resolve - local dependency keeps its declared version", async () => {
  const provider = new StubProvider(
    { gleam_stdlib: [{ version: "1.0.5" }] },
    {},
    {
      "../dep_local": {
        version: "0.1.0",
        deps: [{ source: "hex", name: "gleam_stdlib", requirement: ">= 0.44.0 and < 2.0.0" }],
      },
    },
  );

  const manifest = await resolve(
    [{ source: "local", name: "dep_local", path: "../dep_local" }],
    { provider, baseDir: "/projects/app" },
  );

  assertEquals(versionsOf(manifest), { dep_local: "0.1.0", gleam_stdlib: "1.0.5" });
  assertEquals(manifest.packages.find((pkg) => pkg.name === "dep_local")!.locator, {
    source: "local",
    path: "/projects/app/../dep_local",
  });
});

Deno.test("resolve - all three sources in one graph", async () => {
  const provider = new StubProvider(
    {
      gleam_stdlib: [{ version: "1.0.5" }],
      snag: [{ version: "1.2.0", deps: { gleam_stdlib: ">= 0.34.0 and < 2.0.0" } }],
    },
    {
      "https://github.com/lpil/argv#v1.1.0": {
        version: "1.1.0",
        deps: [{ source: "hex", name: "gleam_stdlib", requirement: ">= 0.44.0 and < 2.0.0" }],
      },
    },
    {
      "./vendor/tool": {
        version: "0.3.0",
        deps: [
          { source: "hex", name: "snag", requirement: "~> 1.0" },
          { source: "git", name: "argv", url: "https://github.com/lpil/argv", ref: "v1.1.0" },
        ],
      },
    },
  );

  const manifest = await resolve(
    [{ source: "local", name: "tool", path: "./vendor/tool" }],
    { provider, baseDir: "/workspace" },
  );

  assertEquals(versionsOf(manifest), {
    tool: "0.3.0",
    snag: "1.2.0",
    argv: "1.1.0",
    gleam_stdlib: "1.0.5",
  });
  assertEquals(
    manifest.packages.map((pkg) => `${pkg.name}:${pkg.source}`),
    ["argv:git", "gleam_stdlib:hex", "snag:hex", "tool:local"],
  );
});

Deno.test("resolve - reports the conflicting requirements when nothing fits", async () => {
  const provider = new StubProvider({
    app: [{ version: "1.0.0", deps: { lib: ">= 2.0.0" } }],
    lib: [{ version: "1.0.0" }],
  });

  const error = await assertRejects(
    () => resolve([{ source: "hex", name: "app", requirement: ">= 1.0.0" }], { provider }),
    ResolutionError,
  );

  assertEquals(error.message.includes("lib"), true);
  assertEquals(error.message.includes("app@1.0.0 requires lib >= 2.0.0"), true);
});

Deno.test("resolve - rejects a package demanded from two different sources", async () => {
  const provider = new StubProvider(
    { gleam_stdlib: [{ version: "1.0.5" }] },
    {
      "https://github.com/lpil/argv#main": { version: "1.1.0" },
      "https://github.com/other/argv#main": { version: "1.1.0" },
    },
  );

  const error = await assertRejects(
    () =>
      resolve([
        { source: "git", name: "argv", url: "https://github.com/lpil/argv", ref: "main" },
        { source: "git", name: "argv", url: "https://github.com/other/argv", ref: "main" },
      ], { provider }),
    ResolutionError,
  );

  assertEquals(error.message.includes("Conflicting sources for argv"), true);
});

Deno.test("resolve - surfaces unknown packages", async () => {
  const provider = new StubProvider({ app: [{ version: "1.0.0", deps: { ghost: ">= 1.0.0" } }] });

  await assertRejects(
    () => resolve([{ source: "hex", name: "app", requirement: ">= 1.0.0" }], { provider }),
    Error,
    "Package not found on Hex: ghost",
  );
});
