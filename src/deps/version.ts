/**
 * Semantic versions and Hex requirement ranges
 *
 * Gleam reuses Hex's requirement syntax. A survey of 3242 requirements across
 * 27 packages (854 releases) found only five shapes in the wild:
 *
 *   ">= V and < V"   (2008)   "~> V"   (1115)   "~> V or ~> V"   (106)
 *   "V"              (11)     ">= V"   (2)
 *
 * The parser below covers those plus the remaining comparison operators.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifiers, e.g. ["rc", "1"] for "1.0.0-rc.1" */
  pre: string[];
}

export class VersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionError";
  }
}

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(input: string): Version {
  const match = VERSION_RE.exec(input.trim());
  if (!match) {
    throw new VersionError(`Invalid version: ${input}`);
  }

  const [, major, minor, patch, pre] = match;

  return {
    major: Number(major),
    minor: Number(minor ?? 0),
    patch: Number(patch ?? 0),
    pre: pre ? pre.split(".") : [],
  };
}

export function formatVersion(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.pre.length > 0 ? `${core}-${version.pre.join(".")}` : core;
}

export function isPrerelease(version: Version): boolean {
  return version.pre.length > 0;
}

/**
 * Count how many numeric segments a version string spells out.
 * "~>" widens differently for "~> 1.2" and "~> 1.2.3", so the distinction matters.
 */
function coreSegmentCount(input: string): number {
  return input.trim().replace(/^v/, "").split("+")[0].split("-")[0].split(".").length;
}

/** Compare two versions: negative if a < b, positive if a > b, 0 if equal. */
export function compareVersions(a: Version, b: Version): number {
  for (const [left, right] of [[a.major, b.major], [a.minor, b.minor], [a.patch, b.patch]]) {
    if (left !== right) return left < right ? -1 : 1;
  }

  // A release outranks any of its pre-releases; absence of identifiers wins.
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;

  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const left = a.pre[i];
    const right = b.pre[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;

    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);

    if (leftNumeric && rightNumeric) {
      const diff = Number(left) - Number(right);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (leftNumeric !== rightNumeric) {
      // Numeric identifiers sort below alphanumeric ones (semver 11.4.3)
      return leftNumeric ? -1 : 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }

  return 0;
}

export interface Requirement {
  /** The requirement as written, kept for error messages */
  readonly source: string;
  satisfies(version: Version): boolean;
}

type Predicate = (version: Version) => boolean;

/**
 * "~> 1.2" allows >= 1.2.0 and < 2.0.0; "~> 1.2.3" allows >= 1.2.3 and < 1.3.0.
 */
function tildePredicate(spec: string): Predicate {
  const lower = parseVersion(spec);
  const upper: Version = coreSegmentCount(spec) >= 3
    ? { major: lower.major, minor: lower.minor + 1, patch: 0, pre: [] }
    : { major: lower.major + 1, minor: 0, patch: 0, pre: [] };

  return (version) => compareVersions(version, lower) >= 0 && compareVersions(version, upper) < 0;
}

function termPredicate(term: string): Predicate {
  const match = /^(>=|<=|==|!=|>|<|~>)?\s*(.+)$/.exec(term.trim());
  if (!match) {
    throw new VersionError(`Unparsable requirement term: ${term}`);
  }

  const [, operator = "==", spec] = match;
  if (operator === "~>") return tildePredicate(spec);

  const target = parseVersion(spec);

  switch (operator) {
    case ">=":
      return (version) => compareVersions(version, target) >= 0;
    case ">":
      return (version) => compareVersions(version, target) > 0;
    case "<=":
      return (version) => compareVersions(version, target) <= 0;
    case "<":
      return (version) => compareVersions(version, target) < 0;
    case "!=":
      return (version) => compareVersions(version, target) !== 0;
    default:
      return (version) => compareVersions(version, target) === 0;
  }
}

export function parseRequirement(source: string): Requirement {
  const alternatives = source.split(/\s+or\s+/i).map((alternative) => {
    const predicates = alternative.split(/\s+and\s+/i).map(termPredicate);
    return (version: Version) => predicates.every((predicate) => predicate(version));
  });

  if (alternatives.length === 0) {
    throw new VersionError(`Empty requirement: ${source}`);
  }

  return {
    source,
    satisfies: (version) => alternatives.some((alternative) => alternative(version)),
  };
}

/** Convenience wrapper for callers holding version strings. */
export function satisfies(version: string, requirement: string): boolean {
  return parseRequirement(requirement).satisfies(parseVersion(version));
}
