/**
 * Module stubs, embedded as text.
 *
 * These are read at runtime and written into the worker's temporary tree, so
 * they must survive `deno compile`. Loading them from disk with an
 * `import.meta.url`-relative path works when running from source but the
 * compiled binary has no real filesystem counterpart, so they are imported as
 * text instead: Deno inlines the contents into the bundle.
 */

import gleam from "./worker/stubs/gleam.mjs" with { type: "text" };
import gleamIo from "./worker/stubs/gleam_io.mjs" with { type: "text" };
import gleamString from "./worker/stubs/gleam_string.mjs" with { type: "text" };

export const moduleStubs = {
  gleam,
  gleamIo,
  gleamString,
};
