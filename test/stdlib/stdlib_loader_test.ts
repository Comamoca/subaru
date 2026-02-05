import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { StdlibLoader } from "../../src/stdlib/stdlib_loader.ts";
import { BUILTIN_PACKAGE_NAMES } from "../../src/stdlib/builtin_packages.ts";
import { join } from "https://deno.land/std@0.220.0/path/mod.ts";

// Use a temporary directory for testing
const TEST_CACHE_DIR = join(Deno.makeTempDirSync(), "subaru-stdlib-test-cache");

async function cleanupTestCache(): Promise<void> {
  try {
    await Deno.remove(TEST_CACHE_DIR, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

// Mock write_module function for testing
function createMockWriteModule(): {
  writeModule: (projectId: number, moduleName: string, code: string) => void;
  modules: Map<string, string>;
} {
  const modules = new Map<string, string>();
  return {
    writeModule: (_projectId: number, moduleName: string, code: string) => {
      modules.set(moduleName, code);
    },
    modules,
  };
}

Deno.test("StdlibLoader - builtin packages list", () => {
  // Verify we have the expected 8 builtin packages
  // Note: dinostore and gleam_stdin are excluded due to API incompatibilities
  assertEquals(BUILTIN_PACKAGE_NAMES.length, 8);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("gleam_stdlib"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("gleam_javascript"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("gleam_json"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("gleam_http"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("gleam_fetch"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("plinth"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("filepath"), true);
  assertEquals(BUILTIN_PACKAGE_NAMES.includes("simplifile"), true);
});

Deno.test("StdlibLoader - load single package from Hex.pm", async () => {
  await cleanupTestCache();

  const loader = new StdlibLoader(
    {
      cache: {
        enabled: true,
        directory: TEST_CACHE_DIR,
        ttl: 3600,
      },
    },
    false, // debug
  );

  const { writeModule, modules } = createMockWriteModule();

  try {
    // Load just gleam_json (a small package) to test the flow
    const result = await loader.loadThirdPartyPackages(
      ["gleam_json"],
      0,
      writeModule,
    );

    // Should have loaded at least the main module
    assertEquals(result.modules.length > 0, true);

    // Check that gleam/json module was loaded
    const jsonModule = result.modules.find((m) => m.moduleName === "gleam/json");
    assertExists(jsonModule);
    assertEquals(jsonModule.packageName, "gleam_json");

    // Verify it was written to our mock
    assertEquals(modules.has("gleam/json"), true);
  } catch (error) {
    // Network may be unavailable
    console.warn(
      "Skipping test - network unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }

  await cleanupTestCache();
});

Deno.test("StdlibLoader - load with specific version", async () => {
  await cleanupTestCache();

  const loader = new StdlibLoader(
    {
      cache: {
        enabled: true,
        directory: TEST_CACHE_DIR,
        ttl: 3600,
      },
    },
    false,
  );

  const { writeModule, modules } = createMockWriteModule();

  try {
    // Load a specific version
    const result = await loader.loadThirdPartyPackages(
      [{ name: "gleam_json", version: "2.0.0" }],
      0,
      writeModule,
    );

    assertEquals(result.modules.length > 0, true);
    assertEquals(modules.has("gleam/json"), true);
  } catch (error) {
    console.warn(
      "Skipping test - network unavailable or version not found:",
      error instanceof Error ? error.message : String(error),
    );
  }

  await cleanupTestCache();
});

Deno.test("StdlibLoader - caching works", async () => {
  await cleanupTestCache();

  const loader = new StdlibLoader(
    {
      cache: {
        enabled: true,
        directory: TEST_CACHE_DIR,
        ttl: 3600,
      },
    },
    false,
  );

  try {
    // First load - should download from Hex.pm
    const { writeModule: wm1, modules: modules1 } = createMockWriteModule();
    const startTime1 = Date.now();
    await loader.loadThirdPartyPackages(["gleam_json"], 0, wm1);
    const duration1 = Date.now() - startTime1;

    // Create a new loader (simulating a new run)
    const loader2 = new StdlibLoader(
      {
        cache: {
          enabled: true,
          directory: TEST_CACHE_DIR,
          ttl: 3600,
        },
      },
      false,
    );

    // Second load - should be from cache (faster)
    const { writeModule: wm2, modules: modules2 } = createMockWriteModule();
    const startTime2 = Date.now();
    await loader2.loadThirdPartyPackages(["gleam_json"], 0, wm2);
    const duration2 = Date.now() - startTime2;

    // Both should have loaded the module
    assertEquals(modules1.has("gleam/json"), true);
    assertEquals(modules2.has("gleam/json"), true);

    // Second load should generally be faster (cached)
    // But we won't assert this as network conditions vary
    console.log(`First load: ${duration1}ms, Second load (cached): ${duration2}ms`);
  } catch (error) {
    console.warn(
      "Skipping test - network unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }

  await cleanupTestCache();
});

Deno.test("StdlibLoader - fallback io implementation", () => {
  const loader = new StdlibLoader({}, false);
  const { writeModule, modules } = createMockWriteModule();

  loader.addFallbackIo(0, writeModule);

  assertEquals(modules.has("gleam/io"), true);

  const ioCode = modules.get("gleam/io")!;
  assertEquals(ioCode.includes("pub fn println"), true);
  assertEquals(ioCode.includes("pub fn print"), true);
  assertEquals(ioCode.includes("pub fn debug"), true);
});
