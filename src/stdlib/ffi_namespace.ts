/**
 * FFI namespace placement
 *
 * Every package's FFI files are collected into one directory of their own,
 * `_ffi/<package>/<package-relative path>`, so two packages that ship an FFI
 * file at the same relative path never overwrite each other. The compiled
 * modules stay flat — the WASM compiler emits one package and their imports
 * already assume a flat tree — so the two sides are connected by rewriting
 * specifiers:
 *
 *   - A compiled module in package `p` writes `../gleam_json_ffi.mjs`; the
 *     file now sits at `_ffi/p/gleam_json_ffi.mjs`, so the specifier is
 *     rewritten relative to the module's own directory.
 *   - An FFI file in package `p` resolves each of its own imports against its
 *     package-relative directory, then emits it relative to its new home under
 *     `_ffi/p/`. A different package (`../gleam_stdlib/gleam/option.mjs`) or
 *     the build directory (`../../build/dev/javascript/lustre/...`) names a
 *     compiled module in the flat tree, so the package segment is dropped; a
 *     path matching a known FFI file follows that file into its namespace.
 */

/** Directory that holds the per-package FFI trees. */
export const FFI_ROOT = "_ffi";

/** Specifiers Deno resolves on its own and that must be left alone. */
const PASSTHROUGH_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

/** The output directory a Gleam JavaScript build writes packages into. */
const BUILD_PREFIX = /^(?:\.\.\/)+(?:build\/dev\/javascript\/)/;

/** `(../)+[build/dev/javascript/]<package>/<rest>` */
const CROSS_PACKAGE = /^(?:\.\.\/)+(?:build\/dev\/javascript\/)?([^/]+)\/(.+)$/;

/** One FFI file with the package that shipped it. */
export interface FfiEntry {
  /** Package-relative path as extracted, e.g. "gleam_json_ffi.mjs". */
  path: string;
  /** Package the file came from. */
  packageName: string;
  content: string;
}

/** Join path segments, dropping empty ones, with `/` separators. */
function joinPath(...segments: string[]): string {
  return segments.filter((segment) => segment !== "").join("/");
}

/**
 * Where an FFI file is written in the runtime tree.
 * @returns a path relative to the temp directory root.
 */
export function namespaceFfiPath(pkg: string, ffiPath: string): string {
  return joinPath(FFI_ROOT, pkg, ffiPath);
}

/** Directory part of a `/`-separated path ("" when there is none). */
function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Turn `target` into a specifier relative to `fromDir`. */
function relativeSpecifier(fromDir: string, target: string): string {
  const from = fromDir === "" ? [] : fromDir.split("/");
  const to = target.split("/");

  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) {
    common += 1;
  }

  const up = from.length - common;
  const rest = to.slice(common).join("/");
  return `${up === 0 ? "./" : "../".repeat(up)}${rest}`;
}

/** Resolve a relative specifier against the importing file's directory. */
function resolveAgainst(fromDir: string, specifier: string): string {
  const parts = fromDir === "" ? [] : fromDir.split("/");
  for (const segment of specifier.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

/**
 * Index the Flat FFI tree by package-relative path so a compiled module's
 * `../<name>.mjs` can be matched to a file, and a module name matched to its
 * package.
 */
export interface FfiLayout {
  /**
   * Package a compiled module belongs to, by module name (e.g.
   * "gleam/json" -> "gleam_json"). Derived from the modules that were loaded.
   */
  packageOfModule: Map<string, string>;
  /**
   * Package-relative FFI path -> the packages that ship a file there. Usually
   * one; two when two packages collide on the same relative path, which is the
   * case namespacing exists to separate.
   */
  ownersOfFfiPath: Map<string, Set<string>>;
}

/** Build the lookup tables a rewrite pass needs. */
export function buildFfiLayout(
  entries: Iterable<FfiEntry>,
  modules: Iterable<{ moduleName: string; packageName: string }>,
): FfiLayout {
  const packageOfModule = new Map<string, string>();
  for (const module of modules) {
    packageOfModule.set(module.moduleName, module.packageName);
  }

  const ownersOfFfiPath = new Map<string, Set<string>>();
  for (const entry of entries) {
    let owners = ownersOfFfiPath.get(entry.path);
    if (!owners) {
      owners = new Set();
      ownersOfFfiPath.set(entry.path, owners);
    }
    owners.add(entry.packageName);
  }

  return { packageOfModule, ownersOfFfiPath };
}

/**
 * Which package owns an FFI path, as seen from a particular package.
 *
 * A file shipped by the importing package is that package's own copy and wins
 * outright — this is what keeps two packages that both ship `ffi.mjs` from
 * being cross-wired. Otherwise the path must have exactly one owner; an
 * ambiguous reference from outside is left alone so it fails loudly rather
 * than silently pointing at the wrong package.
 */
function ownerForPath(
  path: string,
  fromPackage: string | undefined,
  layout: FfiLayout,
): string | undefined {
  const owners = layout.ownersOfFfiPath.get(path);
  if (!owners || owners.size === 0) return undefined;
  if (fromPackage && owners.has(fromPackage)) return fromPackage;
  if (owners.size === 1) return [...owners][0];
  return undefined;
}

const COMPILED_SPECIFIER = /((?:import|export)[\s\S]*?from\s*|import\s*\(\s*)(["'])([^"']+)\2/g;

/**
 * Point a compiled module's relative specifiers at the namespaced FFI tree.
 *
 * Only specifiers that `../` out of the module's directory and name a file
 * known to be in the flat FFI tree are touched; everything else (other
 * compiled modules, the prelude, `gleam_stdlib.mjs`) stays where it is.
 */
export function rewriteCompiledFfiImports(
  content: string,
  moduleName: string,
  layout: FfiLayout,
): string {
  const moduleDir = dirOf(moduleName);
  const pkg = layout.packageOfModule.get(moduleName);

  return content.replace(
    COMPILED_SPECIFIER,
    (match, prefix, quote, specifier) => {
      if (!specifier.startsWith(".")) return match;

      const resolved = resolveAgainst(moduleDir, specifier);
      const owner = ownerForPath(resolved, pkg, layout);
      if (!owner) return match;

      const target = namespaceFfiPath(owner, resolved);
      const rewritten = relativeSpecifier(moduleDir, target);
      return `${prefix}${quote}${rewritten}${quote}`;
    },
  );
}

export interface FfiFileRewriteOptions {
  /** Package that ships this FFI file. */
  packageName: string;
  /** Package-relative path of this FFI file, e.g. "runtime/client/spa.ffi.mjs". */
  ffiPath: string;
  layout: FfiLayout;
  /** Packages present, so a climbing `../<pkg>/...` is recognised. */
  knownPackages: Set<string>;
  /** Rewrite bare specifiers to `npm:`. Defaults to true. */
  rewriteBareToNpm?: boolean;
  onRewrite?: (from: string, to: string) => void;
  onUnknownPackage?: (specifier: string, packageName: string) => void;
  onNpmSpecifier?: (packageName: string) => void;
}

/**
 * Rewrite one FFI file's imports for the namespaced tree.
 *
 * The file ships assuming the `build/dev/javascript/<pkg>/` layout, so every
 * relative specifier is first resolved against its *package-relative*
 * directory. The target is then classified:
 *
 *   - a different package (`../gleam_stdlib/gleam/option.mjs`) or the build
 *     directory (`../../build/dev/javascript/lustre/...`) names a file in the
 *     flat compiled tree, so the package segment is dropped;
 *   - a path that matches a known FFI file is placed in that file's own
 *     namespace directory;
 *   - anything else (`./gleam.mjs`, `./gleam/option.mjs`) is a compiled module
 *     in the flat tree and keeps its resolved path.
 *
 * The result is emitted relative to the file's final location under `_ffi/`.
 * A bare specifier becomes `npm:` so Deno can resolve it.
 */
export function rewriteFfiFile(
  content: string,
  options: FfiFileRewriteOptions,
): string {
  const { packageName, ffiPath, layout, knownPackages } = options;
  const pkgRelDir = dirOf(ffiPath);
  const sourceDir = dirOf(namespaceFfiPath(packageName, ffiPath));

  return content.replace(
    COMPILED_SPECIFIER,
    (match, prefix, quote, specifier) => {
      if (specifier.startsWith("/") || PASSTHROUGH_SCHEME.test(specifier)) return match;

      let target: string | undefined;

      if (specifier.startsWith(".")) {
        if (specifier.startsWith("../")) {
          const match2 = CROSS_PACKAGE.exec(specifier);
          if (match2) {
            const [, packageSegment, rest] = match2;
            if (BUILD_PREFIX.test(specifier)) {
              // build/dev/javascript/<pkg>/<rest>: <rest> is already flat.
              target = rest;
            } else if (knownPackages.has(packageSegment)) {
              target = rest;
            } else {
              options.onUnknownPackage?.(specifier, packageSegment);
              return match;
            }
          }
        }

        if (target === undefined) {
          const resolved = resolveAgainst(pkgRelDir, specifier);
          const owner = ownerForPath(resolved, packageName, layout);
          target = owner ? namespaceFfiPath(owner, resolved) : resolved;
        }
      } else {
        if (options.rewriteBareToNpm === false) return match;
        options.onNpmSpecifier?.(specifier);
        target = `npm:${specifier}`;
      }

      const rewritten = target.startsWith("npm:") ? target : relativeSpecifier(sourceDir, target);
      if (rewritten === specifier) return match;

      options.onRewrite?.(specifier, rewritten);
      return `${prefix}${quote}${rewritten}${quote}`;
    },
  );
}
