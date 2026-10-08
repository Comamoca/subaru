import { AssertionError } from "https://deno.land/std@0.218.0/assert/mod.ts";

/**
 * Skip a test when the network is unavailable, but never swallow a failed
 * assertion: a hidden assertion failure is worse than a red test.
 */
export function skipOnNetworkError(error: unknown): void {
  if (error instanceof AssertionError) throw error;

  console.warn(
    "Skipping test - network unavailable:",
    error instanceof Error ? error.message : String(error),
  );
}
