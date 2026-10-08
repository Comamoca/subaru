import { assertEquals, assertThrows } from "https://deno.land/std@0.218.0/assert/mod.ts";
import {
  compareVersions,
  formatVersion,
  isPrerelease,
  parseVersion,
  satisfies,
  VersionError,
} from "../../src/deps/version.ts";

Deno.test("parseVersion - full and partial versions", () => {
  assertEquals(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, pre: [] });
  assertEquals(parseVersion("1.2"), { major: 1, minor: 2, patch: 0, pre: [] });
  assertEquals(parseVersion("1"), { major: 1, minor: 0, patch: 0, pre: [] });
  assertEquals(parseVersion("v1.2.3"), { major: 1, minor: 2, patch: 3, pre: [] });
});

Deno.test("parseVersion - prerelease and build metadata", () => {
  assertEquals(parseVersion("1.0.0-rc.1").pre, ["rc", "1"]);
  assertEquals(parseVersion("0.18.0-rc1").pre, ["rc1"]);
  assertEquals(parseVersion("1.0.0+build.5").pre, []);
  assertEquals(isPrerelease(parseVersion("1.0.0-rc.1")), true);
  assertEquals(isPrerelease(parseVersion("1.0.0")), false);
});

Deno.test("parseVersion - rejects garbage", () => {
  assertThrows(() => parseVersion("not-a-version"), VersionError);
  assertThrows(() => parseVersion(""), VersionError);
});

Deno.test("formatVersion - round trips", () => {
  assertEquals(formatVersion(parseVersion("1.2.3")), "1.2.3");
  assertEquals(formatVersion(parseVersion("1.0.0-rc.1")), "1.0.0-rc.1");
  assertEquals(formatVersion(parseVersion("2.1")), "2.1.0");
});

Deno.test("compareVersions - numeric ordering", () => {
  const order = ["0.9.9", "1.0.0", "1.0.1", "1.1.0", "2.0.0", "10.0.0"];

  for (let i = 1; i < order.length; i++) {
    const previous = parseVersion(order[i - 1]);
    const current = parseVersion(order[i]);
    assertEquals(compareVersions(previous, current) < 0, true, `${order[i - 1]} < ${order[i]}`);
    assertEquals(compareVersions(current, previous) > 0, true);
  }

  assertEquals(compareVersions(parseVersion("1.2.3"), parseVersion("1.2.3")), 0);
});

Deno.test("compareVersions - prereleases sort below their release", () => {
  assertEquals(compareVersions(parseVersion("1.0.0-rc.1"), parseVersion("1.0.0")) < 0, true);
  assertEquals(compareVersions(parseVersion("1.0.0-rc.1"), parseVersion("1.0.0-rc.2")) < 0, true);
  assertEquals(compareVersions(parseVersion("1.0.0-rc.2"), parseVersion("1.0.0-rc.10")) < 0, true);
  // Numeric identifiers rank below alphanumeric ones
  assertEquals(compareVersions(parseVersion("1.0.0-1"), parseVersion("1.0.0-alpha")) < 0, true);
});

Deno.test("satisfies - the five shapes found in the Hex registry", () => {
  // ">= V and < V" — 2008 of 3242 surveyed requirements
  assertEquals(satisfies("1.5.0", ">= 1.0.0 and < 2.0.0"), true);
  assertEquals(satisfies("2.0.0", ">= 1.0.0 and < 2.0.0"), false);
  assertEquals(satisfies("0.9.0", ">= 1.0.0 and < 2.0.0"), false);

  // "~> V" with two segments widens to the next major
  assertEquals(satisfies("0.19.0", "~> 0.19"), true);
  assertEquals(satisfies("0.25.0", "~> 0.19"), true);
  assertEquals(satisfies("1.0.0", "~> 0.19"), false);

  // "~> V" with three segments widens to the next minor
  assertEquals(satisfies("1.2.9", "~> 1.2.3"), true);
  assertEquals(satisfies("1.3.0", "~> 1.2.3"), false);
  assertEquals(satisfies("1.2.2", "~> 1.2.3"), false);

  // "~> V or ~> V"
  assertEquals(satisfies("0.40.0", "~> 0.34 or ~> 1.0"), true);
  assertEquals(satisfies("1.5.0", "~> 0.34 or ~> 1.0"), true);
  assertEquals(satisfies("2.0.0", "~> 0.34 or ~> 1.0"), false);

  // Bare version means exactly that version
  assertEquals(satisfies("0.14.0", "0.14.0"), true);
  assertEquals(satisfies("0.14.1", "0.14.0"), false);

  // ">= V" alone
  assertEquals(satisfies("99.0.0", ">= 0.18.0"), true);
  assertEquals(satisfies("0.17.0", ">= 0.18.0"), false);
});

Deno.test("satisfies - remaining comparison operators", () => {
  assertEquals(satisfies("1.0.0", "<= 1.0.0"), true);
  assertEquals(satisfies("1.0.1", "<= 1.0.0"), false);
  assertEquals(satisfies("1.0.1", "> 1.0.0"), true);
  assertEquals(satisfies("1.0.0", "!= 1.0.0"), false);
  assertEquals(satisfies("1.0.1", "!= 1.0.0"), true);
});
