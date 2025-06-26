#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

import Subaru from "../src/subaru_runner.ts";

// Example main code that uses preloaded modules
const mainCode = `
import gleam/io
import gleam/int
import my_utils

pub fn main() {
  let greeting = my_utils.greet("World")
  io.println(greeting)
  
  let result = my_utils.add(5, 3)
  io.println("5 + 3 = " <> int.to_string(result))
}
`;

async function testPreloadScripts() {
  console.log("🔧 Preload Scripts Example");
  console.log("==========================");

  const config = {
    debug: true,
    logLevel: 'silent' as const,
    preloadScripts: [
      {
        moduleName: "my_utils",
        code: `
// Custom utility module
pub fn greet(name: String) -> String {
  "Hello, " <> name <> "!"
}

pub fn add(a: Int, b: Int) -> Int {
  a + b
}
`,
      },
      {
        moduleName: "gleam/int",
        code: `
// Simple int module for string conversion
@external(javascript, "globalThis", "String")
pub fn to_string(value: Int) -> String
`,
      }
    ],
  };

  try {
    console.log("\n📦 Running with preloaded modules...");
    const result = await Subaru.run(mainCode, config);
    
    if (result.success) {
      console.log("✅ Success!");
      result.output.forEach(line => console.log(`   ${line}`));
    } else {
      console.log("❌ Failed:");
      result.errors.forEach(error => console.log(`   ${error}`));
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

if (import.meta.main) {
  testPreloadScripts();
}