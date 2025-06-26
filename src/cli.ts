#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

import { parseArgs } from "https://deno.land/std@0.218.0/cli/parse_args.ts";
import Subaru from "./subaru_runner.ts";
import { loadConfig, createExampleConfig, saveConfig } from "./config.ts";

interface CliOptions {
  help: boolean;
  version: boolean;
  file?: string;
  code?: string;
  url?: string;
  compile?: boolean;
  debug?: boolean;
  "log-level"?: string;
  "wasm-path"?: string;
  config?: string;
  "init-config"?: boolean;
  "no-warnings"?: boolean;
  "show-warnings"?: boolean;
  "warning-color"?: string;
}

const VERSION = "1.0.0";

const HELP_TEXT = `
Subaru - Gleam code runner using WASM

USAGE:
    subaru [OPTIONS] [<FILE> | --code <CODE> | --url <URL>]

ARGUMENTS:
    <FILE>                  Gleam file to execute

OPTIONS:
    -h, --help              Show this help message
    -v, --version           Show version information
    -f, --file <FILE>       Execute Gleam code from file (alternative to <FILE>)
    -c, --code <CODE>       Execute Gleam code from string
    -u, --url <URL>         Execute Gleam code from remote URL
    --compile               Only compile, don't execute
    --debug                 Enable debug output
    --log-level <LEVEL>     Set log level (silent|error|warn|info|debug|trace)
    --wasm-path <PATH>      Path to WASM compiler directory
    --config <PATH>         Use specific config file
    --init-config           Create example config file
    --no-warnings           Suppress compiler warnings (default)
    --show-warnings          Show compiler warnings
    --warning-color <COLOR>  Set warning color (red|yellow|green|blue|magenta|cyan|white|gray)

EXAMPLES:
    subaru hello.gleam      # Execute file directly
    
    subaru --code "import gleam/io
    pub fn main() { io.println(\\"Hello!\\") }"
    
    subaru --file hello.gleam
    
    subaru --url https://example.com/script.gleam
    
    subaru --compile --debug --code "pub fn add(a, b) { a + b }"
    
    subaru --show-warnings hello.gleam    # Show compiler warnings
    
    subaru --show-warnings --warning-color blue hello.gleam    # Blue warning text
    
    subaru --init-config    # Create example configuration file
    
    subaru --config my-config.json script.gleam
`;

async function runFromFile(filePath: string, config: any): Promise<void> {
  try {
    const code = await Deno.readTextFile(filePath);
    await runCode(code, config);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    Deno.exit(1);
  }
}

async function runFromUrl(url: string, config: any): Promise<void> {
  try {
    const subaru = new Subaru(config);
    
    if (config.compile) {
      // Fetch and compile only
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        Deno.exit(1);
      }
      const code = await response.text();
      
      const result = await subaru.compile(code);
      
      if (result.success) {
        console.log("Compilation successful!");
        if (result.javascript) {
          console.log("\\n--- JavaScript Output ---");
          console.log(result.javascript);
        }
        if (result.erlang) {
          console.log("\\n--- Erlang Output ---");
          console.log(result.erlang);
        }
        // Warnings are already displayed by the GleamRunner
      } else {
        console.error("Compilation failed:");
        result.errors.forEach(error => console.error(`  ${error}`));
        // Warnings are already displayed by the GleamRunner, even on failure
        Deno.exit(1);
      }
    } else {
      const result = await subaru.executeFromUrl(url);
      
      if (result.success) {
        result.output.forEach(line => console.log(line));
      } else {
        console.error("Execution failed:");
        result.errors.forEach(error => console.error(`  ${error}`));
        Deno.exit(1);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    Deno.exit(1);
  }
}

async function runCode(code: string, config: any): Promise<void> {
  try {
    const subaru = new Subaru(config);
    
    if (config.compile) {
      const result = await subaru.compile(code);
      
      if (result.success) {
        console.log("Compilation successful!");
        if (result.javascript) {
          console.log("\\n--- JavaScript Output ---");
          console.log(result.javascript);
        }
        if (result.erlang) {
          console.log("\\n--- Erlang Output ---");
          console.log(result.erlang);
        }
        // Warnings are already displayed by the GleamRunner
      } else {
        console.error("Compilation failed:");
        result.errors.forEach(error => console.error(`  ${error}`));
        // Warnings are already displayed by the GleamRunner, even on failure
        Deno.exit(1);
      }
    } else {
      const result = await subaru.execute(code);
      
      if (result.success) {
        result.output.forEach(line => console.log(line));
      } else {
        console.error("Execution failed:");
        result.errors.forEach(error => console.error(`  ${error}`));
        Deno.exit(1);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    Deno.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "version", "compile", "debug", "init-config", "no-warnings", "show-warnings"],
    string: ["file", "code", "url", "wasm-path", "log-level", "config", "warning-color"],
    alias: {
      h: "help",
      v: "version",
      f: "file",
      c: "code",
      u: "url",
    },
  }) as CliOptions;

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (args.version) {
    console.log(`Subaru v${VERSION}`);
    return;
  }

  if (args["init-config"]) {
    try {
      const exampleConfig = createExampleConfig();
      await saveConfig(exampleConfig);
      console.log("✅ Created example config file: subaru.config.json");
      console.log("Edit the file to customize preload scripts and other settings.");
      return;
    } catch (error) {
      console.error("❌ Failed to create config file:", error.message);
      Deno.exit(1);
    }
  }

  // Load config file
  let fileConfig = {};
  try {
    fileConfig = await loadConfig(args.config);
  } catch (error) {
    console.error("❌ Failed to load config file:", error.message);
    Deno.exit(1);
  }

  // Merge CLI args with config file (CLI args take precedence)
  const config = {
    ...fileConfig,
    wasmPath: args["wasm-path"] || fileConfig.wasmPath,
    debug: args.debug !== undefined ? args.debug : fileConfig.debug,
    logLevel: (args["log-level"] || fileConfig.logLevel) as any,
    compile: args.compile,
    noWarnings: args["show-warnings"] ? false : (args["no-warnings"] ? true : (fileConfig.noWarnings !== undefined ? fileConfig.noWarnings : true)),
    warningColor: args["warning-color"] || fileConfig.warningColor || "yellow",
  };


  // Check for positional arguments (file paths)
  const positionalArgs = args._ as string[];
  
  if (args.file) {
    await runFromFile(args.file, config);
  } else if (args.code) {
    await runCode(args.code, config);
  } else if (args.url) {
    await runFromUrl(args.url, config);
  } else if (positionalArgs.length > 0) {
    // Handle positional file argument
    const filePath = positionalArgs[0];
    
    // Check if it looks like a Gleam file or just treat as file
    if (filePath.endsWith('.gleam') || await fileExists(filePath)) {
      await runFromFile(filePath, config);
    } else {
      console.error(`File not found: ${filePath}`);
      Deno.exit(1);
    }
  } else {
    console.error("Please provide a file path, or use --code, --url options");
    console.log(HELP_TEXT);
    Deno.exit(1);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Unexpected error:", error);
    Deno.exit(1);
  });
}