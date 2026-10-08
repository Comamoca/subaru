import { assertEquals } from "https://deno.land/std@0.218.0/assert/mod.ts";
import {
  defaultEntryModule,
  entryAlias,
  GIT_ENTRY_MODULE,
  synthesizeGitEntry,
  withGitRepo,
} from "../src/git_entry.ts";

Deno.test("defaultEntryModule - a package runs its own module", () => {
  assertEquals(defaultEntryModule("sqlode"), "sqlode");
});

Deno.test("synthesizeGitEntry - imports the module and calls main", () => {
  assertEquals(
    synthesizeGitEntry("sqlode"),
    `import sqlode

pub fn main() {
  sqlode.main()
}
`,
  );
});

Deno.test("entryAlias - a nested module is bound under its last segment", () => {
  assertEquals(entryAlias("sqlode"), "sqlode");
  assertEquals(entryAlias("hinoto/cli"), "cli");
  assertEquals(entryAlias("pkg/a/b"), "b");
});

Deno.test("synthesizeGitEntry - nested entry imports an explicit alias and calls it", () => {
  assertEquals(
    synthesizeGitEntry("hinoto/cli"),
    `import hinoto/cli as cli

pub fn main() {
  cli.main()
}
`,
  );
});

Deno.test("synthesizeGitEntry - nested entry never calls through the slash path", () => {
  const code = synthesizeGitEntry("sqlode/cli");
  assertEquals(code.includes("import sqlode/cli as cli"), true);
  assertEquals(code.includes("cli.main()"), true);
  assertEquals(code.includes("sqlode/cli.main()"), false);
});

Deno.test("withGitRepo - appends the repo as a git dependency", () => {
  const result = withGitRepo(["argv"], "sqlode", "https://github.com/nao1215/sqlode", "main");

  assertEquals(result, [
    "argv",
    { name: "sqlode", git: "https://github.com/nao1215/sqlode", ref: "main" },
  ]);
});

Deno.test("withGitRepo - replaces an existing entry of the same name", () => {
  const existing = [
    { name: "other", path: "./other" },
    { name: "sqlode", version: "0.30.0" },
  ];

  assertEquals(
    withGitRepo(existing, "sqlode", "https://github.com/nao1215/sqlode", "v0.34.0"),
    [
      { name: "other", path: "./other" },
      { name: "sqlode", git: "https://github.com/nao1215/sqlode", ref: "v0.34.0" },
    ],
  );
});

Deno.test("withGitRepo - does not mutate the input list", () => {
  const input: string[] = ["argv"];
  withGitRepo(input, "sqlode", "https://example.com/sqlode", "main");
  assertEquals(input, ["argv"]);
});

Deno.test("GIT_ENTRY_MODULE - is a plain name the compiler accepts", () => {
  assertEquals(GIT_ENTRY_MODULE, "subaru_entry");
  assertEquals(/^[a-z][a-z0-9_]*$/.test(GIT_ENTRY_MODULE), true);
});
