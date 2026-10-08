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
 * The name a Gleam expression uses for an imported module: the last path
 * segment. `import hinoto/cli` binds the module as `cli`, so a call site must
 * read `cli.main()` and never `hinoto/cli.main()`.
 */
export function entryAlias(entryModule: string): string {
  const segments = entryModule.split("/");
  return segments[segments.length - 1];
}

/**
 * The Gleam source that runs a repository's entry point.
 *
 * The module is imported and its `main` called. A nested entry such as
 * `hinoto/cli` cannot be called through its full path, because Gleam binds the
 * module under its last segment, so the import names that alias explicitly and
 * the call goes through it. A package named after the module itself needs no
 * alias and keeps the plain `import <package>` form.
 */
export function synthesizeGitEntry(entryModule: string): string {
  const alias = entryAlias(entryModule);
  const importLine = alias === entryModule
    ? `import ${entryModule}`
    : `import ${entryModule} as ${alias}`;

  return `${importLine}

pub fn main() {
  ${alias}.main()
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
