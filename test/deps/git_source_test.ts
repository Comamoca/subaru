import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { GitSource, repoSlug } from "../../src/deps/git_source.ts";
import { skipOnNetworkError as skip } from "./network.ts";

const ARGV_URL = "https://github.com/lpil/argv";
// A commit that exists for good; refs move, commit ids do not.
const ARGV_COMMIT = "cda6ca64ca4ec09d5b37b36da9388da54ae641ea";

Deno.test("repoSlug - produces a filesystem-safe directory name", () => {
  assertEquals(repoSlug("https://github.com/lpil/argv"), "github.com_lpil_argv");
  assertEquals(repoSlug("https://github.com/lpil/argv.git"), "github.com_lpil_argv");
  assertEquals(repoSlug("git+ssh://git@example.com/a/b"), "git_example.com_a_b");
});

Deno.test("GitSource - resolves a branch to a commit without cloning", async () => {
  const source = new GitSource();

  try {
    const commit = await source.resolveRef(ARGV_URL, "main");
    assertEquals(/^[0-9a-f]{40}$/.test(commit), true);
  } catch (error) {
    skip(error);
  }
});

Deno.test("GitSource - resolves a tag and passes a commit through", async () => {
  const source = new GitSource();

  try {
    const fromTag = await source.resolveRef(ARGV_URL, "v1.1.0");
    assertEquals(/^[0-9a-f]{40}$/.test(fromTag), true);

    // A commit id resolves to itself without a round trip
    const fromCommit = await source.resolveRef(ARGV_URL, ARGV_COMMIT);
    assertEquals(fromCommit, ARGV_COMMIT);
  } catch (error) {
    skip(error);
  }
});

Deno.test("GitSource - reads gleam.toml and sources at a commit", async () => {
  const cacheDir = await Deno.makeTempDir({ prefix: "subaru-git-test-" });
  const source = new GitSource({ cacheDir });

  try {
    const manifest = await source.readGleamToml(ARGV_URL, ARGV_COMMIT);
    assertEquals(manifest.name, "argv");
    assertEquals(manifest.version, "1.1.0");
    assertEquals(manifest.denoPermissions?.allowRead, true);

    const files = await source.readSourceFiles(ARGV_URL, ARGV_COMMIT);
    const paths = files.map((file) => file.path).sort();

    assertEquals(paths.includes("src/argv.gleam"), true);
    assertEquals(paths.includes("src/argv_ffi.mjs"), true);
    // Erlang FFI and test sources are not part of a JavaScript build
    assertEquals(paths.some((path) => path.endsWith(".erl")), false);
    assertEquals(paths.some((path) => path.startsWith("test/")), false);

    const gleamModule = files.find((file) => file.path === "src/argv.gleam")!;
    assertEquals(gleamModule.isFFI, false);
    assertExists(gleamModule.content);

    const ffi = files.find((file) => file.path === "src/argv_ffi.mjs")!;
    assertEquals(ffi.isFFI, true);
  } catch (error) {
    skip(error);
  } finally {
    await Deno.remove(cacheDir, { recursive: true }).catch(() => {});
  }
});
