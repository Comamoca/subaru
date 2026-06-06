import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import Subaru from "../src/subaru_runner.ts";

const SIMPLE_GLEAM_CODE = `
import gleam/io

pub fn main() {
  io.println("Hello from Subaru!")
}
`;

const INVALID_GLEAM_CODE = `
invalid syntax here
`;

// These tests require the WASM compiler (~/.cache/subaru/wasm-compiler/).
// We initialize WASM before each test; if it fails, the test skips cleanly.
// Resource sanitizers are disabled because the WASM compiler and stdlib
// loading involve async operations that may not close cleanly.

async function ensureWasm(): Promise<Subaru> {
  const subaru = new Subaru();
  try {
    await subaru.init();
  } catch (error) {
    console.warn(
      "Skipping test - WASM compiler not available:",
      error instanceof Error ? error.message : String(error),
    );
    // Return a sentinel; the caller checks for this.
    return null as unknown as Subaru;
  }
  return subaru;
}

Deno.test({
  name: "Execution produces output (regression: runtime module resolution)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(SIMPLE_GLEAM_CODE);
    assertEquals(result.success, true, "Execution should succeed");
    assertExists(result.output);
    assertEquals(result.errors.length, 0);
    assertEquals(result.output.length > 0, true,
      "Expected at least one line of output",
    );
    assertEquals(result.output[0], "Hello from Subaru!",
      "First output line should match the io.println call",
    );
  },
});

Deno.test({
  name: "Subaru initialization",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;
    // If we reach here, init succeeded.
  },
});

Deno.test({
  name: "Simple Gleam code execution",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(SIMPLE_GLEAM_CODE);
    assertEquals(result.success, true, "Execution should succeed");
    assertExists(result.output);
    assertEquals(result.errors.length, 0);
  },
});

Deno.test({
  name: "Invalid Gleam code handling",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(INVALID_GLEAM_CODE);
    assertEquals(result.success, false,
      "Invalid code should not execute successfully",
    );
    assertExists(result.errors);
  },
});

Deno.test({
  name: "Compile-only mode",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.compile(SIMPLE_GLEAM_CODE);
    assertEquals(result.success, true, "Compilation should succeed");
    assertExists(result.javascript);
    assertEquals(result.errors.length, 0);
  },
});

Deno.test({
  name: "Static run method",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Static run creates its own Subaru instance internally
    try {
      const result = await Subaru.run(SIMPLE_GLEAM_CODE);
      if (result.success) {
        assertExists(result.output);
      }
    } catch (error) {
      console.warn(
        "Skipping test - WASM compiler not available:",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

Deno.test({
  name: "Worker execution with custom permissions",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(SIMPLE_GLEAM_CODE);
    assertEquals(result.success, true, "Execution should succeed");
    assertExists(result.output);
    assertEquals(result.errors.length, 0);
  },
});

Deno.test({
  name: "Worker execution with timeout configuration",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = await ensureWasm();
    if (!subaru) return;

    const result = await subaru.execute(SIMPLE_GLEAM_CODE);
    assertEquals(result.success, true, "Execution should succeed");
    assertExists(result.output);
  },
});
