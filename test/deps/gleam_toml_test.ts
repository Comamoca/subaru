import { assertEquals, assertThrows } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { GleamTomlError, parseGleamToml } from "../../src/deps/gleam_toml.ts";

Deno.test("parseGleamToml - hex, git and path dependencies", () => {
  const manifest = parseGleamToml(`
name = "refproj"
version = "1.0.0"
gleam = ">= 1.14.0"
target = "javascript"
internal_modules = ["refproj/internal/**"]

[dependencies]
gleam_stdlib = ">= 0.44.0 and < 2.0.0"
pinned = { version = "1.2.3" }
dep_local = { path = "../dep_local" }
argv = { git = "https://github.com/lpil/argv", ref = "main" }

[dev-dependencies]
gleeunit = ">= 1.0.0 and < 2.0.0"
`);

  assertEquals(manifest.name, "refproj");
  assertEquals(manifest.version, "1.0.0");
  assertEquals(manifest.gleamRequirement, ">= 1.14.0");
  assertEquals(manifest.target, "javascript");
  assertEquals(manifest.internalModules, ["refproj/internal/**"]);

  assertEquals(manifest.dependencies, [
    { source: "hex", name: "gleam_stdlib", requirement: ">= 0.44.0 and < 2.0.0" },
    { source: "hex", name: "pinned", requirement: "1.2.3" },
    { source: "local", name: "dep_local", path: "../dep_local" },
    { source: "git", name: "argv", url: "https://github.com/lpil/argv", ref: "main" },
  ]);

  assertEquals(manifest.devDependencies, [
    { source: "hex", name: "gleeunit", requirement: ">= 1.0.0 and < 2.0.0" },
  ]);
});

Deno.test("parseGleamToml - git ref aliases", () => {
  const manifest = parseGleamToml(`
name = "aliases"
version = "0.1.0"

[dependencies]
by_tag = { git = "https://example.com/a", tag = "v1.0.0" }
by_rev = { git = "https://example.com/b", rev = "abc123" }
by_branch = { git = "https://example.com/c", branch = "develop" }
`);

  assertEquals(manifest.dependencies.map((spec) => spec.source === "git" && spec.ref), [
    "v1.0.0",
    "abc123",
    "develop",
  ]);
});

Deno.test("parseGleamToml - Deno permissions from [javascript.deno]", () => {
  const simplifile = parseGleamToml(`
name = "simplifile"
version = "2.7.0"

[javascript.deno]
allow_all = true
`);
  assertEquals(simplifile.denoPermissions?.allowAll, true);

  const stdlib = parseGleamToml(`
name = "gleam_stdlib"
version = "1.0.5"

[javascript.deno]
allow_read = ["./"]
`);
  assertEquals(stdlib.denoPermissions?.allowRead, ["./"]);

  const argv = parseGleamToml(`
name = "argv"
version = "1.1.0"

[javascript.deno]
allow_read = true
`);
  assertEquals(argv.denoPermissions?.allowRead, true);

  const filepath = parseGleamToml(`
name = "filepath"
version = "1.1.2"
`);
  assertEquals(filepath.denoPermissions, undefined);
});

Deno.test("parseGleamToml - defaults and rejections", () => {
  const minimal = parseGleamToml(`name = "minimal"`);
  assertEquals(minimal.version, "0.0.0");
  assertEquals(minimal.dependencies, []);
  assertEquals(minimal.internalModules, []);

  assertThrows(() => parseGleamToml(`version = "1.0.0"`), GleamTomlError, 'missing the "name"');

  assertThrows(
    () =>
      parseGleamToml(`
name = "broken"

[dependencies]
mystery = { registry = "elsewhere" }
`),
    GleamTomlError,
    "mystery",
  );

  assertThrows(
    () =>
      parseGleamToml(`
name = "broken"

[dependencies]
unpinned = { git = "https://example.com/x" }
`),
    GleamTomlError,
    "missing a ref",
  );
});
