import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import { PackageCache } from "../../src/hex/package_cache.ts";
import { join } from "https://deno.land/std@0.220.0/path/mod.ts";

// Use a temporary directory for testing
const TEST_CACHE_DIR = join(Deno.makeTempDirSync(), "subaru-test-cache");

async function cleanupTestCache(): Promise<void> {
  try {
    await Deno.remove(TEST_CACHE_DIR, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

Deno.test("PackageCache - set and get", async () => {
  await cleanupTestCache();

  const cache = new PackageCache({
    directory: TEST_CACHE_DIR,
    ttl: 3600,
  });

  const testFiles = [
    { path: "src/gleam/io.gleam", content: "pub fn println(msg) { Nil }" },
    { path: "src/gleam/list.gleam", content: "pub fn map(list, f) { [] }" },
  ];

  // Store files
  await cache.set("test_package", "1.0.0", testFiles);

  // Verify cache has the package
  const has = await cache.has("test_package", "1.0.0");
  assertEquals(has, true);

  // Retrieve files
  const files = await cache.get("test_package", "1.0.0");
  assertExists(files);
  assertEquals(files.size, 2);
  assertEquals(files.get("gleam/io"), "pub fn println(msg) { Nil }");
  assertEquals(files.get("gleam/list"), "pub fn map(list, f) { [] }");

  await cleanupTestCache();
});

Deno.test("PackageCache - metadata", async () => {
  await cleanupTestCache();

  const cache = new PackageCache({
    directory: TEST_CACHE_DIR,
    ttl: 3600,
  });

  const testFiles = [{ path: "src/test.gleam", content: "pub fn test() { 42 }" }];

  await cache.set("meta_test", "2.0.0", testFiles);

  const metadata = await cache.getMetadata("meta_test", "2.0.0");
  assertExists(metadata);
  assertEquals(metadata.packageName, "meta_test");
  assertEquals(metadata.version, "2.0.0");
  assertEquals(metadata.ttl, 3600);
  assertExists(metadata.cachedAt);
  assertEquals(metadata.files.length, 1);

  await cleanupTestCache();
});

Deno.test("PackageCache - TTL expiration", async () => {
  await cleanupTestCache();

  // Use a very short TTL (1 second)
  const cache = new PackageCache({
    directory: TEST_CACHE_DIR,
    ttl: 1,
  });

  const testFiles = [{ path: "src/expire.gleam", content: "pub fn expire() { Nil }" }];

  await cache.set("expire_test", "1.0.0", testFiles);

  // Should be available immediately
  let has = await cache.has("expire_test", "1.0.0");
  assertEquals(has, true);

  // Wait for TTL to expire
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // Should be expired now
  has = await cache.has("expire_test", "1.0.0");
  assertEquals(has, false);

  await cleanupTestCache();
});

Deno.test("PackageCache - remove", async () => {
  await cleanupTestCache();

  const cache = new PackageCache({
    directory: TEST_CACHE_DIR,
    ttl: 3600,
  });

  const testFiles = [{ path: "src/remove.gleam", content: "pub fn remove() { Nil }" }];

  await cache.set("remove_test", "1.0.0", testFiles);
  assertEquals(await cache.has("remove_test", "1.0.0"), true);

  await cache.remove("remove_test", "1.0.0");
  assertEquals(await cache.has("remove_test", "1.0.0"), false);

  await cleanupTestCache();
});

Deno.test("PackageCache - list", async () => {
  await cleanupTestCache();

  const cache = new PackageCache({
    directory: TEST_CACHE_DIR,
    ttl: 3600,
  });

  await cache.set("pkg1", "1.0.0", [{ path: "src/a.gleam", content: "a" }]);
  await cache.set("pkg1", "2.0.0", [{ path: "src/b.gleam", content: "b" }]);
  await cache.set("pkg2", "1.0.0", [{ path: "src/c.gleam", content: "c" }]);

  const packages = await cache.list();
  assertEquals(packages.length, 3);

  const pkg1v1 = packages.find((p) => p.packageName === "pkg1" && p.version === "1.0.0");
  assertExists(pkg1v1);

  const pkg1v2 = packages.find((p) => p.packageName === "pkg1" && p.version === "2.0.0");
  assertExists(pkg1v2);

  const pkg2v1 = packages.find((p) => p.packageName === "pkg2" && p.version === "1.0.0");
  assertExists(pkg2v1);

  await cleanupTestCache();
});

Deno.test("PackageCache - clear", async () => {
  await cleanupTestCache();

  const cache = new PackageCache({
    directory: TEST_CACHE_DIR,
    ttl: 3600,
  });

  await cache.set("clear1", "1.0.0", [{ path: "src/a.gleam", content: "a" }]);
  await cache.set("clear2", "1.0.0", [{ path: "src/b.gleam", content: "b" }]);

  let packages = await cache.list();
  assertEquals(packages.length, 2);

  await cache.clear();

  packages = await cache.list();
  assertEquals(packages.length, 0);

  await cleanupTestCache();
});

Deno.test("PackageCache - disabled cache", async () => {
  const cache = new PackageCache({
    enabled: false,
    directory: TEST_CACHE_DIR,
  });

  const testFiles = [{ path: "src/test.gleam", content: "test" }];

  await cache.set("disabled_test", "1.0.0", testFiles);

  // Should always return false/null when disabled
  assertEquals(await cache.has("disabled_test", "1.0.0"), false);
  assertEquals(await cache.get("disabled_test", "1.0.0"), null);
  assertEquals(await cache.list(), []);

  await cleanupTestCache();
});
