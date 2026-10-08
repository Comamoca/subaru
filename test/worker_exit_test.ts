import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.218.0/assert/mod.ts";
import Subaru from "../src/subaru_runner.ts";

// Gleam CLIs end by calling `exit`, which they reach through FFI files that
// import it from node:process. Inside a worker that call used to tear the
// worker down without a result, so the host waited for the timeout and then
// dropped everything the program had printed.
const EXIT_ZERO_CODE = `
import gleam/io

@external(javascript, "node:process", "exit")
pub fn exit(code: Int) -> Nil

pub fn main() {
  io.println("before exit")
  exit(0)
  io.println("after exit")
}
`;

const EXIT_THREE_CODE = EXIT_ZERO_CODE.replace("exit(0)", "exit(3)");

// A short timeout turns a regression into a fast failure instead of a 30s
// wait: a hanging worker reports a timeout error rather than an exit status.
async function ensureWasm(): Promise<Subaru | null> {
  const subaru = new Subaru({ timeout: 5000 });
  try {
    await subaru.init();
  } catch (error) {
    console.warn(
      "Skipping test - WASM compiler not available:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
  return subaru;
}

Deno.test({
  name: "Programs that call exit finish and keep their output",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(EXIT_ZERO_CODE);
    const printed = result.output.join("\n");

    assertEquals(result.success, true, `run should succeed: ${result.errors.join("; ")}`);
    assertEquals(result.exitCode, 0);
    assertStringIncludes(printed, "before exit");
    assertEquals(
      printed.includes("after exit"),
      false,
      "exit must stop the program instead of returning to it",
    );
  },
});

Deno.test({
  name: "A non-zero exit fails the run and keeps its output",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(EXIT_THREE_CODE);

    assertEquals(result.exitCode, 3);
    assertEquals(result.success, false);
    assertStringIncludes(result.errors.join("\n"), "status 3");
    assertStringIncludes(result.output.join("\n"), "before exit");
  },
});
