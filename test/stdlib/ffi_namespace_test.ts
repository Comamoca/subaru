import { assertEquals } from "https://deno.land/std@0.218.0/assert/mod.ts";
import {
  buildFfiLayout,
  FFI_ROOT,
  type FfiEntry,
  namespaceFfiPath,
  rewriteCompiledFfiImports,
  rewriteFfiFile,
} from "../../src/stdlib/ffi_namespace.ts";

const entries: FfiEntry[] = [
  { path: "gleam_json_ffi.mjs", packageName: "gleam_json", content: "" },
  { path: "gleam_stdlib.mjs", packageName: "gleam_stdlib", content: "" },
  { path: "dict.mjs", packageName: "gleam_stdlib", content: "" },
  { path: "filepath_ffi.mjs", packageName: "filepath", content: "" },
];
const modules = [
  { moduleName: "gleam/json", packageName: "gleam_json" },
  { moduleName: "gleam/dict", packageName: "gleam_stdlib" },
  { moduleName: "gleam/list", packageName: "gleam_stdlib" },
];

const layout = buildFfiLayout(entries, modules);

Deno.test("namespaceFfiPath - nests under the package", () => {
  assertEquals(
    namespaceFfiPath("gleam_json", "gleam_json_ffi.mjs"),
    "_ffi/gleam_json/gleam_json_ffi.mjs",
  );
  assertEquals(
    namespaceFfiPath("lustre", "runtime/client/spa.ffi.mjs"),
    "_ffi/lustre/runtime/client/spa.ffi.mjs",
  );
  assertEquals(FFI_ROOT, "_ffi");
});

Deno.test("rewriteCompiledFfiImports - points a module at its package FFI", () => {
  // gleam/json compiled output imports ../gleam_json_ffi.mjs
  assertEquals(
    rewriteCompiledFfiImports(`import { x } from "../gleam_json_ffi.mjs";`, "gleam/json", layout),
    `import { x } from "../_ffi/gleam_json/gleam_json_ffi.mjs";`,
  );
});

Deno.test("rewriteCompiledFfiImports - survives a deeper module directory", () => {
  // plinth/browser/window imports ../../window_ffi.mjs
  const deepEntries: FfiEntry[] = [
    { path: "window_ffi.mjs", packageName: "plinth", content: "" },
  ];
  const deepLayout = buildFfiLayout(deepEntries, [
    { moduleName: "plinth/browser/window", packageName: "plinth" },
  ]);

  assertEquals(
    rewriteCompiledFfiImports(
      `import { w } from "../../window_ffi.mjs";`,
      "plinth/browser/window",
      deepLayout,
    ),
    `import { w } from "../../_ffi/plinth/window_ffi.mjs";`,
  );
});

Deno.test("rewriteCompiledFfiImports - compiled-module imports are untouched", () => {
  const source = `import { List } from "../gleam/list.mjs";
import { Ok } from "../gleam.mjs";
import { json } from "../gleam_json_ffi.mjs";
`;
  const rewritten = rewriteCompiledFfiImports(source, "gleam/json", layout);

  assertEquals(rewritten.includes(`from "../gleam/list.mjs"`), true);
  assertEquals(rewritten.includes(`from "../gleam.mjs"`), true);
  assertEquals(rewritten.includes(`from "../_ffi/gleam_json/gleam_json_ffi.mjs"`), true);
});

Deno.test("rewriteCompiledFfiImports - an extra FFI file (dict.mjs) is namespaced", () => {
  assertEquals(
    rewriteCompiledFfiImports(`import { x } from "../dict.mjs";`, "gleam/dict", layout),
    `import { x } from "../_ffi/gleam_stdlib/dict.mjs";`,
  );
});

Deno.test("rewriteFfiFile - same-package compiled import is re-relativized", () => {
  // argv_ffi.mjs imports the prelude ./gleam.mjs; from _ffi/argv/ that is ../../gleam.mjs
  const argvLayout = buildFfiLayout(
    [{ path: "argv_ffi.mjs", packageName: "argv", content: "" }],
    [{ moduleName: "argv", packageName: "argv" }],
  );

  assertEquals(
    rewriteFfiFile(`import { Ok } from "./gleam.mjs";`, {
      packageName: "argv",
      ffiPath: "argv_ffi.mjs",
      layout: argvLayout,
      knownPackages: new Set(["argv"]),
    }),
    `import { Ok } from "../../gleam.mjs";`,
  );
});

Deno.test("rewriteFfiFile - cross-package import is flattened", () => {
  // gleam_regexp_ffi.mjs imports ../gleam_stdlib/gleam/option.mjs
  const regexpLayout = buildFfiLayout(
    [{ path: "gleam_regexp_ffi.mjs", packageName: "gleam_regexp", content: "" }],
    [{ moduleName: "gleam/regexp", packageName: "gleam_regexp" }],
  );

  assertEquals(
    rewriteFfiFile(`import { Some } from "../gleam_stdlib/gleam/option.mjs";`, {
      packageName: "gleam_regexp",
      ffiPath: "gleam_regexp_ffi.mjs",
      layout: regexpLayout,
      knownPackages: new Set(["gleam_regexp", "gleam_stdlib"]),
    }),
    `import { Some } from "../../gleam/option.mjs";`,
  );
});

Deno.test("rewriteFfiFile - FFI-to-FFI import follows the move", () => {
  // gleam_stdlib.mjs imports ./dict.mjs, both now under _ffi/gleam_stdlib/
  const layout = buildFfiLayout(
    [
      { path: "gleam_stdlib.mjs", packageName: "gleam_stdlib", content: "" },
      { path: "dict.mjs", packageName: "gleam_stdlib", content: "" },
    ],
    [{ moduleName: "gleam/dict", packageName: "gleam_stdlib" }],
  );

  assertEquals(
    rewriteFfiFile(`import * as $dict from "./dict.mjs";`, {
      packageName: "gleam_stdlib",
      ffiPath: "gleam_stdlib.mjs",
      layout,
      knownPackages: new Set(["gleam_stdlib"]),
    }),
    `import * as $dict from "./dict.mjs";`,
  );
});

Deno.test("rewriteFfiFile - bare specifier becomes npm", () => {
  const layout = buildFfiLayout(
    [{ path: "yaml_ffi.mjs", packageName: "yay", content: "" }],
    [{ moduleName: "yay", packageName: "yay" }],
  );

  assertEquals(
    rewriteFfiFile(`import yaml from "js-yaml";`, {
      packageName: "yay",
      ffiPath: "yaml_ffi.mjs",
      layout,
      knownPackages: new Set(["yay"]),
    }),
    `import yaml from "npm:js-yaml";`,
  );
});

Deno.test("rewriteFfiFile - node: specifiers are untouched", () => {
  const layout = buildFfiLayout([], []);
  const source = `import fs from "node:fs";`;
  assertEquals(
    rewriteFfiFile(source, {
      packageName: "p",
      ffiPath: "p_ffi.mjs",
      layout,
      knownPackages: new Set(["p"]),
    }),
    source,
  );
});

Deno.test("cross-package collision: same relative path, two packages", () => {
  const colliding: FfiEntry[] = [
    { path: "ffi.mjs", packageName: "alpha", content: "alpha" },
    { path: "ffi.mjs", packageName: "beta", content: "beta" },
  ];
  const collisionLayout = buildFfiLayout(colliding, [
    { moduleName: "alpha/main", packageName: "alpha" },
    { moduleName: "beta/main", packageName: "beta" },
  ]);

  // Both keep their own namespace path, so neither overwrites the other.
  assertEquals(namespaceFfiPath("alpha", "ffi.mjs"), "_ffi/alpha/ffi.mjs");
  assertEquals(namespaceFfiPath("beta", "ffi.mjs"), "_ffi/beta/ffi.mjs");

  assertEquals(
    rewriteCompiledFfiImports(`import x from "../ffi.mjs";`, "alpha/main", collisionLayout),
    `import x from "../_ffi/alpha/ffi.mjs";`,
  );
  assertEquals(
    rewriteCompiledFfiImports(`import x from "../ffi.mjs";`, "beta/main", collisionLayout),
    `import x from "../_ffi/beta/ffi.mjs";`,
  );
});
