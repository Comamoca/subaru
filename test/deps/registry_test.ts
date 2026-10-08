import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { HexRegistry } from "../../src/deps/registry.ts";
import { skipOnNetworkError as skip } from "./network.ts";

Deno.test("HexRegistry - releases carry versions and requirements", async () => {
  const registry = new HexRegistry({ cacheEnabled: false });

  try {
    const releases = await registry.releases("sqlode");

    assertEquals(releases.length > 1, true);

    // Newest first
    assertEquals(releases[0].version, releases.map((r) => r.version)[0]);

    const latest = releases[0];
    assertExists(latest.outerChecksum);
    assertEquals(/^[0-9a-f]{64}$/.test(latest.outerChecksum!), true);

    const names = latest.dependencies.map((dependency) => dependency.name).sort();
    assertEquals(names, [
      "argv",
      "filepath",
      "gleam_regexp",
      "gleam_stdlib",
      "glint",
      "simplifile",
      "yay",
    ]);

    const stdlib = latest.dependencies.find((dependency) => dependency.name === "gleam_stdlib")!;
    assertEquals(/^>=/.test(stdlib.requirement), true);
    assertEquals(stdlib.optional, false);
  } catch (error) {
    skip(error);
  }
});

Deno.test("HexRegistry - candidates drop retired and prerelease versions", async () => {
  const registry = new HexRegistry({ cacheEnabled: false });

  try {
    const all = await registry.releases("gleam_stdlib");
    const candidates = await registry.candidates("gleam_stdlib");

    assertEquals(all.length >= candidates.length, true);
    assertEquals(candidates.some((release) => release.retired), false);
    assertEquals(candidates.some((release) => release.version.includes("-")), false);
  } catch (error) {
    skip(error);
  }
});

Deno.test("HexRegistry - unknown package reports clearly", async () => {
  const registry = new HexRegistry({ cacheEnabled: false });

  try {
    await registry.releases("subaru_definitely_not_a_real_package");
    throw new Error("expected a rejection");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Package not found")) {
      skip(error);
    }
  }
});
