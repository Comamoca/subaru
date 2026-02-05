#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

import Subaru from "../src/subaru_runner.ts";

const gleamCode = `
import gleam/io

pub fn main() {
  io.println("Testing debug modes")
}
`;

async function testDebugModes() {
  console.log("🔧 Debug Mode Examples");
  console.log("======================");

  console.log("\n1. Default mode (silent - no debug output):");
  console.log("--------------------------------------------");
  const defaultResult = await Subaru.run(gleamCode);
  if (defaultResult.success) {
    defaultResult.output.forEach((line) => console.log(`   ${line}`));
  }

  console.log("\n2. Error level (shows compilation errors):");
  console.log("------------------------------------------");
  const errorResult = await Subaru.run(gleamCode, {
    logLevel: "error",
  });
  if (errorResult.success) {
    errorResult.output.forEach((line) => console.log(`   ${line}`));
  }

  console.log("\n3. Debug mode enabled:");
  console.log("---------------------");
  const debugResult = await Subaru.run(gleamCode, {
    debug: true,
    logLevel: "debug",
  });
  if (debugResult.success) {
    debugResult.output.forEach((line) => console.log(`   ${line}`));
  }

  // Remote execution example
  console.log("\n4. Remote script execution:");
  console.log("---------------------------");
  try {
    const remoteResult = await Subaru.runFromUrl(
      "https://raw.githubusercontent.com/Comamoca/subaru/main/examples/remote_example.gleam",
      { logLevel: "silent" },
    );

    if (remoteResult.success) {
      remoteResult.output.forEach((line) => console.log(`   ${line}`));
    } else {
      console.log("   Remote execution failed (URL may not exist yet)");
      remoteResult.errors.forEach((error) => console.log(`   ${error}`));
    }
  } catch (error) {
    console.log("   Remote execution test skipped:", error.message);
  }
}

if (import.meta.main) {
  testDebugModes();
}
