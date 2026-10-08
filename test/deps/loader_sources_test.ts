import { assertEquals } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { StdlibLoader } from "../../src/stdlib/stdlib_loader.ts";
import { skipOnNetworkError as skip } from "./network.ts";

/** Collect what the loader writes into the (here, fake) compiler filesystem. */
function createMockWriteModule() {
  const modules = new Map<string, string>();
  return {
    modules,
    writeModule: (_projectId: number, moduleName: string, code: string) => {
      modules.set(moduleName, code);
    },
  };
}

async function createLocalPackage(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "subaru-local-pkg-" });

  await Deno.mkdir(`${dir}/mylib/src/mylib`, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/mylib/gleam.toml`,
    `name = "mylib"\nversion = "0.2.0"\n`,
  );
  await Deno.writeTextFile(
    `${dir}/mylib/src/mylib.gleam`,
    `pub fn shout(text: String) -> String {\n  text <> "!"\n}\n`,
  );
  await Deno.writeTextFile(
    `${dir}/mylib/src/mylib/internal.gleam`,
    `pub fn helper() -> Int {\n  1\n}\n`,
  );
  await Deno.writeTextFile(
    `${dir}/mylib/src/mylib_ffi.mjs`,
    `export function noop() {}\n`,
  );

  return dir;
}

Deno.test("StdlibLoader - loads a local path package without touching the network", async () => {
  const baseDir = await createLocalPackage();
  const loader = new StdlibLoader({ baseDir, packages: [{ name: "mylib", path: "./mylib" }] });
  const { writeModule, modules } = createMockWriteModule();

  try {
    const result = await loader.loadThirdPartyPackages(
      [{ name: "mylib", path: "./mylib" }],
      0,
      writeModule,
    );

    assertEquals(result.errors, []);
    assertEquals(result.modules.map((mod) => mod.moduleName).sort(), [
      "mylib",
      "mylib/internal",
    ]);
    assertEquals(result.ffiFiles.map((ffi) => ffi.path), ["mylib_ffi.mjs"]);
    assertEquals(modules.has("mylib"), true);
    assertEquals(result.modules.every((mod) => mod.packageName === "mylib"), true);
  } finally {
    await Deno.remove(baseDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("StdlibLoader - exclude filter applies to a local package", async () => {
  const baseDir = await createLocalPackage();
  const loader = new StdlibLoader({ baseDir });
  const { writeModule } = createMockWriteModule();

  try {
    const result = await loader.loadThirdPartyPackages(
      [{ name: "mylib", path: "./mylib", exclude: ["mylib/internal"] }],
      0,
      writeModule,
    );

    assertEquals(result.errors, []);
    assertEquals(result.modules.map((mod) => mod.moduleName), ["mylib"]);
  } finally {
    await Deno.remove(baseDir, { recursive: true }).catch(() => {});
  }
});

Deno.test("StdlibLoader - a git entry without a ref is reported, not guessed", async () => {
  const loader = new StdlibLoader({});
  const { writeModule } = createMockWriteModule();

  const result = await loader.loadThirdPartyPackages(
    [{ name: "argv", git: "https://github.com/lpil/argv" }],
    0,
    writeModule,
  );

  assertEquals(result.modules, []);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].includes("no ref"), true);
});

Deno.test("StdlibLoader - non-hex sources need resolution enabled", async () => {
  const loader = new StdlibLoader({ resolve: false });
  const { writeModule } = createMockWriteModule();

  const result = await loader.loadThirdPartyPackages(
    [{ name: "mylib", path: "./mylib" }],
    0,
    writeModule,
  );

  assertEquals(result.modules, []);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].includes("dependency resolution"), true);
});

Deno.test("StdlibLoader - unresolvable requirements are reported with their origin", async () => {
  const loader = new StdlibLoader({});
  const { writeModule } = createMockWriteModule();

  try {
    const result = await loader.loadThirdPartyPackages(
      [{ name: "gleam_stdlib", version: ">= 99.0.0" }],
      0,
      writeModule,
    );

    assertEquals(result.modules, []);
    assertEquals(result.errors.length, 1);
    assertEquals(result.errors[0].includes("Dependency resolution failed"), true);
    assertEquals(result.errors[0].includes("gleam_stdlib"), true);
  } catch (error) {
    skip(error);
  }
});

Deno.test("StdlibLoader - loads a git package and its hex dependencies", async () => {
  const loader = new StdlibLoader({});
  const { writeModule } = createMockWriteModule();

  try {
    const result = await loader.loadThirdPartyPackages(
      [{ name: "argv", git: "https://github.com/lpil/argv", ref: "v1.1.0" }],
      0,
      writeModule,
    );

    assertEquals(result.errors, []);
    assertEquals(result.modules.some((mod) => mod.moduleName === "argv"), true);
    assertEquals(result.ffiFiles.some((ffi) => ffi.path === "argv_ffi.mjs"), true);
  } catch (error) {
    skip(error);
  }
});
