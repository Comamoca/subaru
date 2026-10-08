#!/usr/bin/env -S deno run --allow-all

/**
 * Setup script to download Gleam WASM compiler
 */

import { join } from "https://deno.land/std@0.220.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.220.0/fs/mod.ts";

// Default Gleam WASM compiler, bumped from 1.11.0: hex packages such as
// gleam_json 3.x declare `gleam = ">= 1.13.0"` and their FFI imports the
// `$`-mangled constructor exports (`DecodeError$UnexpectedByte`) that only
// newer compilers emit, so 1.11.0 fails at module link time.
const GLEAM_VERSION = Deno.env.get("GLEAM_VERSION") || "1.18.1";

/**
 * Get the platform-specific base cache directory for Subaru
 */
export function getSubaruCacheDir(): string {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (!home) {
    throw new Error("Cannot determine home directory");
  }

  const platform = Deno.build.os;
  let cacheBase: string;

  if (platform === "darwin") {
    // macOS: ~/Library/Caches
    cacheBase = `${home}/Library/Caches`;
  } else if (platform === "windows") {
    // Windows: %LOCALAPPDATA%
    cacheBase = Deno.env.get("LOCALAPPDATA") || `${home}/AppData/Local`;
  } else {
    // Linux/Unix: XDG_CACHE_HOME or ~/.cache
    cacheBase = Deno.env.get("XDG_CACHE_HOME") || `${home}/.cache`;
  }

  return join(cacheBase, "subaru");
}

/**
 * Get the platform-specific cache directory for Subaru
 */
export function getWasmCacheDir(): string {
  return join(getSubaruCacheDir(), "wasm-compiler");
}

/**
 * Download Gleam WASM compiler to a specific directory
 */
async function downloadGleamWasmToPath(
  targetPath: string,
  version: string = GLEAM_VERSION,
): Promise<void> {
  console.log(`📥 Downloading Gleam WASM compiler v${version}...`);

  try {
    // Remove existing directory
    try {
      await Deno.remove(targetPath, { recursive: true });
    } catch {
      // Directory doesn't exist, ignore
    }

    // Create target directory
    await ensureDir(targetPath);

    // Download URL
    const downloadUrl =
      `https://github.com/gleam-lang/gleam/releases/download/v${version}/gleam-v${version}-browser.tar.gz`;

    console.log(`Downloading from: ${downloadUrl}`);

    // Download the tar.gz file
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download: ${response.status} ${response.statusText}\n` +
          `Please check your internet connection or verify the version exists.`,
      );
    }

    const tarData = new Uint8Array(await response.arrayBuffer());

    // Save to temporary file
    const tempFile = join(targetPath, "gleam-wasm.tar.gz");
    await Deno.writeFile(tempFile, tarData);

    // Extract using tar command
    const extractProcess = new Deno.Command("tar", {
      args: ["xzf", "gleam-wasm.tar.gz"],
      cwd: targetPath,
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

    console.log(`✅ Gleam WASM compiler downloaded successfully!`);
    console.log(`📁 Location: ${targetPath}`);

    // List extracted files
    console.log("📋 Files:");
    for await (const entry of Deno.readDir(targetPath)) {
      const stat = await Deno.stat(join(targetPath, entry.name));
      const size = entry.isFile ? ` (${(stat.size / 1024).toFixed(1)}KB)` : "";
      console.log(`  ${entry.isDirectory ? "📁" : "📄"} ${entry.name}${size}`);
    }
  } catch (error) {
    console.error("❌ Failed to download Gleam WASM compiler:");
    console.error(error instanceof Error ? error.message : String(error));
    throw error; // Re-throw for caller to handle
  }
}

async function downloadGleamWasm(): Promise<void> {
  try {
    const cacheDir = getWasmCacheDir();
    await downloadGleamWasmToPath(cacheDir);
  } catch (error) {
    console.error("❌ Failed to download Gleam WASM compiler:");
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

/**
 * Clean WASM compiler cache only
 */
export async function cleanWasmCache(): Promise<void> {
  try {
    const wasmDir = getWasmCacheDir();
    console.log(`🗑️  Removing WASM compiler cache: ${wasmDir}`);

    try {
      await Deno.remove(wasmDir, { recursive: true });
      console.log("✅ WASM compiler cache cleared successfully");
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log("ℹ️  WASM compiler cache directory does not exist");
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("❌ Failed to clean WASM cache:");
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Clean entire Subaru cache directory
 */
export async function cleanAllCache(): Promise<void> {
  try {
    const cacheDir = getSubaruCacheDir();
    console.log(`🗑️  Removing entire cache directory: ${cacheDir}`);

    try {
      await Deno.remove(cacheDir, { recursive: true });
      console.log("✅ Cache directory cleared successfully");
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log("ℹ️  Cache directory does not exist");
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("❌ Failed to clean cache:");
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  await downloadGleamWasm();
}

export { downloadGleamWasm, downloadGleamWasmToPath };

// Re-export package cache helpers from hex module
export { cleanPackageCache, getPackageCacheDir } from "./hex/mod.ts";
