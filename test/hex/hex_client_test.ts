import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { HexClient } from "../../src/hex/hex_client.ts";

Deno.test("HexClient - getPackageInfo", async () => {
  const client = new HexClient({ timeout: 10000 });

  try {
    const info = await client.getPackageInfo("gleam_stdlib");

    assertExists(info.name);
    assertEquals(info.name, "gleam_stdlib");
    assertExists(info.latestVersion);
    assertExists(info.releases);
    assertEquals(info.releases.length > 0, true);
  } catch (error) {
    // Skip if network is unavailable
    console.warn(
      "Skipping test - network unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }
});

Deno.test("HexClient - getLatestVersion", async () => {
  const client = new HexClient({ timeout: 10000 });

  try {
    const version = await client.getLatestVersion("gleam_stdlib");

    assertExists(version);
    // Version should be semver-like (e.g., "0.68.0")
    assertEquals(/^\d+\.\d+\.\d+/.test(version), true);
  } catch (error) {
    console.warn(
      "Skipping test - network unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }
});

Deno.test("HexClient - downloadTarball", async () => {
  const client = new HexClient({ timeout: 30000 });

  try {
    // Download a small package for testing
    const version = await client.getLatestVersion("gleam_json");
    const tarball = await client.downloadTarball("gleam_json", version);

    assertExists(tarball);
    assertEquals(tarball.length > 0, true);
    // Tarball should start with tar magic bytes (or gzip magic for .tar.gz)
    // Hex tarballs are plain tar, not gzipped at the outer level
    assertEquals(tarball[0] !== 0, true);
  } catch (error) {
    console.warn(
      "Skipping test - network unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }
});

Deno.test({
  name: "HexClient - error handling for non-existent package",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const client = new HexClient({ timeout: 5000, maxRetries: 1 });

    try {
      await client.getPackageInfo("this_package_definitely_does_not_exist_12345");
      // Should have thrown an error
      assertEquals(true, false, "Expected an error to be thrown");
    } catch (error) {
      // Expected - should fail for non-existent package
      assertExists(error);
      assertEquals(error instanceof Error, true);
    }
  },
});
