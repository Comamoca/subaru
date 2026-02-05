/**
 * Builtin packages definition
 *
 * These packages are always loaded automatically by Subaru.
 * They provide the essential standard library functionality for Gleam code execution.
 *
 * Note: Some packages (dinostore, gleam_stdin) are not included by default
 * due to API incompatibilities with the latest gleam_stdlib. Users can add
 * them manually via the standardLibrary.packages config with specific versions.
 */

export interface BuiltinPackage {
  name: string;
  description: string;
}

/**
 * List of builtin package names that are always loaded
 *
 * These 8 packages are stable and compatible with each other
 */
export const BUILTIN_PACKAGE_NAMES = [
  "gleam_stdlib",
  "gleam_javascript",
  "gleam_json",
  "gleam_http",
  "gleam_fetch",
  "plinth",
  "filepath",
  "simplifile",
] as const;

export type BuiltinPackageName = typeof BUILTIN_PACKAGE_NAMES[number];

/**
 * Builtin packages with descriptions
 */
export const BUILTIN_PACKAGES: readonly BuiltinPackage[] = [
  {
    name: "gleam_stdlib",
    description: "Gleam standard library with core types and functions",
  },
  {
    name: "gleam_javascript",
    description: "Gleam JavaScript interop (arrays, promises)",
  },
  {
    name: "gleam_json",
    description: "JSON encoding and decoding",
  },
  {
    name: "gleam_http",
    description: "HTTP types and utilities",
  },
  {
    name: "gleam_fetch",
    description: "Fetch API for HTTP requests",
  },
  {
    name: "plinth",
    description: "Browser and JavaScript utilities",
  },
  {
    name: "filepath",
    description: "File path manipulation utilities",
  },
  {
    name: "simplifile",
    description: "File system operations for Gleam",
  },
] as const;

/**
 * Check if a package name is a builtin package
 */
export function isBuiltinPackage(packageName: string): packageName is BuiltinPackageName {
  return BUILTIN_PACKAGE_NAMES.includes(packageName as BuiltinPackageName);
}

/**
 * Get builtin package info by name
 */
export function getBuiltinPackage(packageName: string): BuiltinPackage | undefined {
  return BUILTIN_PACKAGES.find((pkg) => pkg.name === packageName);
}

/**
 * GitHub raw URLs for fallback loading (when Hex.pm is unavailable)
 *
 * These are used as a last resort when Hex.pm downloads fail
 */
export const FALLBACK_GITHUB_URLS: Record<BuiltinPackageName, string> = {
  gleam_stdlib: "https://raw.githubusercontent.com/gleam-lang/stdlib/main/src",
  gleam_javascript: "https://raw.githubusercontent.com/gleam-lang/javascript/main/src",
  gleam_json: "https://raw.githubusercontent.com/gleam-lang/json/main/src",
  gleam_http: "https://raw.githubusercontent.com/gleam-lang/http/main/src",
  gleam_fetch: "https://raw.githubusercontent.com/gleam-lang/fetch/main/src",
  plinth: "https://raw.githubusercontent.com/CrowdHailer/plinth/main/src",
  filepath: "https://raw.githubusercontent.com/lpil/filepath/main/src",
  simplifile: "https://raw.githubusercontent.com/bcpeinhardt/simplifile/main/src",
};

/**
 * Known modules for each builtin package (for fallback loading)
 *
 * These are the commonly used modules from each package
 */
export const BUILTIN_PACKAGE_MODULES: Record<BuiltinPackageName, string[]> = {
  gleam_stdlib: [
    "gleam/io.gleam",
    "gleam/list.gleam",
    "gleam/string.gleam",
    "gleam/string_tree.gleam",
    "gleam/int.gleam",
    "gleam/float.gleam",
    "gleam/bool.gleam",
    "gleam/result.gleam",
    "gleam/option.gleam",
    "gleam/order.gleam",
    "gleam/bit_array.gleam",
    "gleam/dict.gleam",
    "gleam/set.gleam",
    "gleam/uri.gleam",
    "gleam/dynamic.gleam",
    "gleam/dynamic/decode.gleam",
    "gleam/function.gleam",
  ],
  gleam_javascript: [
    "gleam/javascript/array.gleam",
    "gleam/javascript/promise.gleam",
  ],
  gleam_json: [
    "gleam/json.gleam",
  ],
  gleam_http: [
    "gleam/http.gleam",
    "gleam/http/request.gleam",
    "gleam/http/response.gleam",
    "gleam/http/service.gleam",
    "gleam/http/cookie.gleam",
  ],
  gleam_fetch: [
    "gleam/fetch.gleam",
    "gleam/fetch/form_data.gleam",
  ],
  plinth: [
    "plinth/browser/document.gleam",
    "plinth/browser/element.gleam",
    "plinth/browser/event.gleam",
    "plinth/browser/window.gleam",
    "plinth/javascript/global.gleam",
    "plinth/javascript/date.gleam",
    "plinth/javascript/console.gleam",
    "plinth/javascript/json.gleam",
    "plinth/javascript/storage.gleam",
  ],
  filepath: [
    "filepath.gleam",
  ],
  simplifile: [
    "simplifile.gleam",
  ],
};
