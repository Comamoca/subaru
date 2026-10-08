/**
 * Entry synthesis for running a git repository
 *
 * A repository declares what it is in `gleam.toml` — its package name and its
 * dependencies — but nothing says which module is the program's entry point.
 * `gleam run` fills that gap with a convention: it runs `<package>`, so this
 * mirrors it. Keeping the two pure helpers here lets the CLI's `--git` path and
 * its tests agree on exactly what gets generated.
 */

/** The conventional entry module of a package: a module named after it. */
export function defaultEntryModule(packageName: string): string {
  return packageName;
}

/**
 * The Gleam source that runs a repository's entry point.
 *
 * The module is imported and its `main` called. For a nested entry such as
 * `sqlode/cli` the last segment is the module the function lives in.
 */
export function synthesizeGitEntry(entryModule: string): string {
  return `import ${entryModule}

pub fn main() {
  ${entryModule}.main()
}
`;
}

/** Minimal shape of a package entry, as `standardLibrary.packages` holds it. */
export interface PackageEntryLike {
  name: string;
}

/**
 * Add a repository to a package list as a git dependency.
 *
 * Any existing entry with the same name is replaced, so an explicit `--git`
 * wins over a stale one from a config file while keeping the rest intact.
 */
export function withGitRepo<T extends string | PackageEntryLike>(
  packages: readonly T[],
  name: string,
  url: string,
  ref: string,
): (T | { name: string; git: string; ref: string })[] {
  const kept = packages.filter((pkg) => typeof pkg === "string" || pkg.name !== name);
  return [...kept, { name, git: url, ref }];
}

/** Module name the synthesized entry is compiled under. */
export const GIT_ENTRY_MODULE = "subaru_entry";
