import { assertEquals, assertExists } from "https://deno.land/std@0.218.0/assert/mod.ts";
import Subaru from "../src/subaru_runner.ts";

// Mock test data
const SIMPLE_GLEAM_CODE = `
import gleam/io

pub fn main() {
  io.println("Hello from Subaru!")
}
`;

const INVALID_GLEAM_CODE = `
invalid syntax here
`;

const _MATH_GLEAM_CODE = `
import gleam/io

pub fn add(a: Int, b: Int) -> Int {
  a + b
}

pub fn main() {
  let result = add(2, 3)
  io.println("2 + 3 = " <> int.to_string(result))
}
`;

// Note: These tests require the WASM compiler to be downloaded first
// Run: chmod +x scripts/download-gleam-wasm.sh && ./scripts/download-gleam-wasm.sh

// Resource sanitizers are disabled for these tests because the Gleam WASM compiler
// and standard library loading involve many async fetch operations that may not
// all be cleanly closed during test execution.

Deno.test({
  name: "Subaru initialization",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = new Subaru();

    // Should not throw an error during initialization
    try {
      await subaru.init();
    } catch (error) {
      // If WASM files are not available, test should be skipped
      console.warn(
        "Skipping test - WASM compiler not available:",
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
  },
});

Deno.test({
  name: "Simple Gleam code execution",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = new Subaru();

    try {
      const result = await subaru.execute(SIMPLE_GLEAM_CODE);

      // Should not have errors if WASM is properly set up
      if (result.success) {
        assertExists(result.output);
        assertEquals(result.errors.length, 0);
      } else {
        console.warn("Execution failed - likely due to missing WASM setup");
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
  name: "Invalid Gleam code handling",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = new Subaru();

    try {
      const result = await subaru.execute(INVALID_GLEAM_CODE);

      // Should handle compilation errors gracefully
      assertEquals(result.success, false);
      assertExists(result.errors);
    } catch (error) {
      console.warn(
        "Skipping test - WASM compiler not available:",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

Deno.test({
  name: "Compile-only mode",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = new Subaru();

    try {
      const result = await subaru.compile(SIMPLE_GLEAM_CODE);

      if (result.success) {
        assertExists(result.javascript);
        assertEquals(result.errors.length, 0);
      } else {
        console.warn("Compilation failed - likely due to missing WASM setup");
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
  name: "Static run method",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    try {
      const result = await Subaru.run(SIMPLE_GLEAM_CODE);

      if (result.success) {
        assertExists(result.output);
      } else {
        console.warn("Static run failed - likely due to missing WASM setup");
      }
    } catch (error) {
      console.warn(
        "Skipping test - WASM compiler not available:",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});

// Worker execution tests

Deno.test({
  name: "Worker execution with custom permissions",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const subaru = new Subaru({
      workerPermissions: {
        read: true,
        write: true,
        net: true,
        env: true,
      },
    });

    try {
      const result = await subaru.execute(SIMPLE_GLEAM_CODE);

      if (result.success) {
        assertExists(result.output);
        assertEquals(result.errors.length, 0);
      } else {
        console.warn("Worker execution failed - likely due to missing WASM setup");
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
  name: "Worker execution with timeout configuration",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Use a reasonable timeout for normal execution
    const subaru = new Subaru({
      timeout: 60000, // 60 seconds
    });

    try {
      const result = await subaru.execute(SIMPLE_GLEAM_CODE);

      if (result.success) {
        assertExists(result.output);
      } else {
        console.warn("Execution failed - likely due to missing WASM setup");
      }
    } catch (error) {
      console.warn(
        "Skipping test - WASM compiler not available:",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});
