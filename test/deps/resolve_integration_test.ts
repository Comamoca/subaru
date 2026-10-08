import { assertEquals } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { parseRequirement, parseVersion } from "../../src/deps/version.ts";
import { HexRegistry } from "../../src/deps/registry.ts";
import {
  DefaultDependencyProvider,
  type Manifest,
  resolve,
  resolveFromGleamToml,
} from "../../src/deps/resolver.ts";
import { skipOnNetworkError as skip } from "./network.ts";

/** Check the manifest against what each chosen release actually requires. */
async function assertConsistent(manifest: Manifest, registry: HexRegistry): Promise<void> {
  const chosen = Object.fromEntries(manifest.packages.map((pkg) => [pkg.name, pkg.version]));

  for (const pkg of manifest.packages) {
    if (pkg.source !== "hex") continue;

    const releases = await registry.releases(pkg.name);
    const release = releases.find((entry) => entry.version === pkg.version)!;
    assertEquals(release !== undefined, true, `${pkg.name}@${pkg.version} is a real release`);

    for (const dependency of release.dependencies) {
      if (dependency.optional) continue;

      const got = chosen[dependency.name];
      assertEquals(got !== undefined, true, `${dependency.name} is in the manifest`);
      assertEquals(
        parseRequirement(dependency.requirement).satisfies(parseVersion(got)),
        true,
        `${pkg.name}@${pkg.version} requires ${dependency.name} ${dependency.requirement}, got ${got}`,
      );
    }
  }
}

Deno.test("resolve - sqlode's real dependency graph", async () => {
  const registry = new HexRegistry();
  const provider = new DefaultDependencyProvider({ registry });

  try {
    const manifest = await resolve([
      { source: "hex", name: "sqlode", requirement: ">= 0.34.0 and < 1.0.0" },
      { source: "hex", name: "gleam_stdlib", requirement: ">= 0.44.0 and < 2.0.0" },
    ], { provider });

    // The same closure `gleam deps download` produces for this root
    assertEquals(manifest.packages.map((pkg) => pkg.name), [
      "argv",
      "filepath",
      "gleam_community_ansi",
      "gleam_community_colour",
      "gleam_json",
      "gleam_regexp",
      "gleam_stdlib",
      "glint",
      "simplifile",
      "snag",
      "sqlode",
      "yamerl",
      "yay",
    ]);

    assertEquals(manifest.packages.every((pkg) => pkg.source === "hex"), true);
    await assertConsistent(manifest, registry);
  } catch (error) {
    skip(error);
  }
});

Deno.test("resolve - hex, git and local sources together", async () => {
  const projectDir = await Deno.makeTempDir({ prefix: "subaru-resolve-" });

  try {
    await Deno.mkdir(`${projectDir}/dep_local/src`, { recursive: true });
    await Deno.writeTextFile(
      `${projectDir}/dep_local/gleam.toml`,
      `name = "dep_local"
version = "0.1.0"

[dependencies]
gleam_stdlib = ">= 0.44.0 and < 2.0.0"
`,
    );
    await Deno.writeTextFile(
      `${projectDir}/dep_local/src/dep_local.gleam`,
      `pub fn hello() -> String {\n  "hi"\n}\n`,
    );

    await Deno.writeTextFile(
      `${projectDir}/gleam.toml`,
      `name = "root"
version = "1.0.0"

[dependencies]
gleam_stdlib = ">= 0.44.0 and < 2.0.0"
dep_local = { path = "./dep_local" }
argv = { git = "https://github.com/lpil/argv", ref = "v1.1.0" }
`,
    );

    const manifest = await resolveFromGleamToml(`${projectDir}/gleam.toml`);

    const bySource = Object.fromEntries(
      manifest.packages.map((pkg) => [pkg.name, pkg.source]),
    );
    assertEquals(bySource, {
      argv: "git",
      dep_local: "local",
      gleam_stdlib: "hex",
    });

    const argv = manifest.packages.find((pkg) => pkg.name === "argv")!;
    assertEquals(argv.version, "1.1.0");
    assertEquals(argv.locator.source === "git" && /^[0-9a-f]{40}$/.test(argv.locator.commit), true);

    const local = manifest.packages.find((pkg) => pkg.name === "dep_local")!;
    assertEquals(local.version, "0.1.0");
    assertEquals(local.requirements, ["gleam_stdlib"]);
  } catch (error) {
    skip(error);
  } finally {
    await Deno.remove(projectDir, { recursive: true }).catch(() => {});
  }
});
