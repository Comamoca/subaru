#!/usr/bin/env -S deno run --allow-all

/**
 * Setup script to download Gleam WASM compiler
 */

import { join } from "https://deno.land/std@0.220.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.220.0/fs/mod.ts";

const GLEAM_VERSION = Deno.env.get("GLEAM_VERSION") || "1.11.0";
const WASM_DIR = "wasm-compiler";

async function downloadGleamWasm(): Promise<void> {
  console.log(`📥 Downloading Gleam WASM compiler v${GLEAM_VERSION}...`);

  try {
    // Remove existing directory
    try {
      await Deno.remove(WASM_DIR, { recursive: true });
    } catch {
      // Directory doesn't exist, ignore
    }

    // Create wasm-compiler directory
    await ensureDir(WASM_DIR);

    // Download URL
    const downloadUrl =
      `https://github.com/gleam-lang/gleam/releases/download/v${GLEAM_VERSION}/gleam-v${GLEAM_VERSION}-browser.tar.gz`;

    console.log(`Downloading from: ${downloadUrl}`);

    // Download the tar.gz file
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const tarData = new Uint8Array(await response.arrayBuffer());

    // Save to temporary file
    const tempFile = join(WASM_DIR, "gleam-wasm.tar.gz");
    await Deno.writeFile(tempFile, tarData);

    // Extract using tar command
    const extractProcess = new Deno.Command("tar", {
      args: ["xzf", "gleam-wasm.tar.gz"],
      cwd: WASM_DIR,
      stdout: "piped",
      stderr: "piped",
    });

    const extractResult = await extractProcess.output();

    if (!extractResult.success) {
      const errorText = new TextDecoder().decode(extractResult.stderr);
      throw new Error(`Failed to extract: ${errorText}`);
    }

    // Remove temporary tar file
    await Deno.remove(tempFile);

    console.log("✅ Gleam WASM compiler downloaded successfully!");
    console.log(`📁 Location: ${join(Deno.cwd(), WASM_DIR)}`);

    // List extracted files
    console.log("📋 Files:");
    for await (const entry of Deno.readDir(WASM_DIR)) {
      const stat = await Deno.stat(join(WASM_DIR, entry.name));
      const size = entry.isFile ? ` (${(stat.size / 1024).toFixed(1)}KB)` : "";
      console.log(`  ${entry.isDirectory ? "📁" : "📄"} ${entry.name}${size}`);
    }
  } catch (error) {
    console.error("❌ Failed to download Gleam WASM compiler:");
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  await downloadGleamWasm();
}

export { downloadGleamWasm };
