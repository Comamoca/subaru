#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

import Subaru from "../../src/subaru_runner.ts";

const simpleCode = `
import gleam/io

pub fn main() {
  io.println("Hello from Gleam via WASM!")
}
`;

async function debugCompile() {
  console.log("🔍 Debug Compilation");
  console.log("==================");

  try {
    const subaru = new Subaru();
    const result = await subaru.compile(simpleCode);

    if (result.success) {
      console.log("✅ Compilation successful!");
      console.log("\n📄 Generated JavaScript:");
      console.log(result.javascript);
      console.log("\n📄 Generated Erlang:");
      console.log(result.erlang);
    } else {
      console.log("❌ Compilation failed:");
      result.errors.forEach((error) => console.log(`   ${error}`));
    }

    if (result.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      result.warnings.forEach((warning) => console.log(`   ${warning}`));
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

if (import.meta.main) {
  debugCompile();
}
