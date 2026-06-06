#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

import Subaru from "../../src/subaru_runner.ts";

// Example Gleam code
const gleamCode = `
import gleam/io

pub fn main() {
  io.println("Hello from Gleam via WASM!")
  io.println("This is running in Deno using Subaru!")
}
`;

const mathCode = `
import gleam/io
import gleam/int

pub fn add(a: Int, b: Int) -> Int {
  a + b
}

pub fn main() {
  let result = add(10, 20)
  io.println("10 + 20 = " <> int.to_string(result))
}
`;

async function runExamples() {
  console.log("🚀 Subaru Examples");
  console.log("==================");

  try {
    console.log("\\n1. Simple Hello World");
    console.log("---------------------");
    const result1 = await Subaru.run(gleamCode);

    if (result1.success) {
      console.log("✅ Success!");
      result1.output.forEach((line) => console.log(`   ${line}`));
    } else {
      console.log("❌ Failed:");
      result1.errors.forEach((error) => console.log(`   ${error}`));
    }

    console.log("\\n2. Math Operations");
    console.log("------------------");
    const result2 = await Subaru.run(mathCode);

    if (result2.success) {
      console.log("✅ Success!");
      result2.output.forEach((line) => console.log(`   ${line}`));
    } else {
      console.log("❌ Failed:");
      result2.errors.forEach((error) => console.log(`   ${error}`));
    }

    console.log("\\n3. Compilation Only");
    console.log("-------------------");
    const subaru = new Subaru();
    const compileResult = await subaru.compile(gleamCode);

    if (compileResult.success) {
      console.log("✅ Compilation successful!");
      console.log("   JavaScript code generated (truncated):");
      console.log(`   ${compileResult.javascript?.substring(0, 100)}...`);
    } else {
      console.log("❌ Compilation failed:");
      compileResult.errors.forEach((error) => console.log(`   ${error}`));
    }
  } catch (error) {
    console.error("\\n❌ Error running examples:", error.message);
    console.log("\\n💡 Make sure to download the WASM compiler first:");
    console.log("   chmod +x scripts/download-gleam-wasm.sh");
    console.log("   ./scripts/download-gleam-wasm.sh");
  }
}

if (import.meta.main) {
  runExamples();
}
