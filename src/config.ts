import type { SubaruConfig } from "./subaru_runner.ts";
import type { StandardLibraryConfig, ThirdPartyPackage } from "./stdlib/mod.ts";
import type { WorkerPermissions } from "./gleam_runner.ts";

export type { StandardLibraryConfig, ThirdPartyPackage, WorkerPermissions };

export interface SubaruConfigFile extends SubaruConfig {
  preloadScripts?: Array<{
    moduleName: string;
    code?: string;
    url?: string;
    filePath?: string;
  }>;
  // Standard library configuration (Hex.pm packages)
  standardLibrary?: StandardLibraryConfig;
  // Disable loading of builtin packages
  noStdlib?: boolean;
  // Worker permissions for code execution
  workerPermissions?: WorkerPermissions;
  // Execution timeout in milliseconds
  timeout?: number;
  // Compile-only mode (CLI flag)
  compile?: boolean;
}

export async function loadConfig(configPath?: string): Promise<SubaruConfig> {
  const defaultConfigPaths = [
    "./subaru.config.json",
    "./subaru.json",
    "./.subaru.json",
  ];

  const paths = configPath ? [configPath] : defaultConfigPaths;

  for (const path of paths) {
    try {
      const configText = await Deno.readTextFile(path);
      const config: SubaruConfigFile = JSON.parse(configText);

      // Validate and normalize config
      return normalizeConfig(config);
    } catch (error) {
      // Config file not found or invalid, continue to next path
      if (configPath) {
        // If user specified a config path and it failed, throw error
        throw new Error(
          `Failed to load config from ${configPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  // No config file found, return empty config
  return {};
}

function normalizeConfig(config: SubaruConfigFile): SubaruConfig {
  const normalized: SubaruConfig = {
    wasmPath: config.wasmPath,
    debug: config.debug,
    logLevel: config.logLevel,
    timeout: config.timeout,
    noWarnings: config.noWarnings,
    warningColor: config.warningColor,
    noStdlib: config.noStdlib,
    standardLibrary: config.standardLibrary,
    workerPermissions: config.workerPermissions,
  };

  // Convert preloadScripts format
  if (config.preloadScripts) {
    normalized.preloadScripts = config.preloadScripts.map((script) => ({
      moduleName: script.moduleName,
      code: script.code || "",
      url: script.url,
      filePath: script.filePath,
    }));
  }

  return normalized;
}

export async function saveConfig(
  config: SubaruConfigFile,
  configPath: string = "./subaru.config.json",
): Promise<void> {
  const configText = JSON.stringify(config, null, 2);
  await Deno.writeTextFile(configPath, configText);
}

// Example config generator
export function createExampleConfig(): SubaruConfigFile {
  return {
    debug: false,
    logLevel: "silent",
    wasmPath: "./wasm-compiler",
    noWarnings: true,
    warningColor: "yellow",
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
        moduleName: "remote_lib",
        url: "https://example.com/my_gleam_lib.gleam",
      },
      {
        moduleName: "local_lib",
        filePath: "./libs/my_local_lib.gleam",
      },
    ],
    // Standard library configuration (Hex.pm-based)
    standardLibrary: {
      // Preset controls which builtin packages are loaded automatically
      // "none" - no builtin packages
      // "minimal" - gleam_stdlib only
      // "standard" - gleam_stdlib, gleam_javascript, gleam_json
      // "full" - all 8 builtin packages (default)
      preset: "full",
      // Additional third-party packages to load (beyond the builtin preset packages)
      packages: [
        // "lustre",  // Just package name (uses latest version)
        // { name: "gleam_otp", version: "0.10.0" },  // Specific version
        // {
        //   name: "some_package",
        //   include: ["some/module"],  // Load only specific modules
        //   exclude: ["some/module/internal"],  // Exclude specific modules
        // },
      ],
      cache: {
        enabled: true,
        ttl: 604800, // 7 days in seconds
      },
    },
    // Set to true to disable loading builtin packages
    noStdlib: false,
    // Worker permissions for code execution (all enabled by default)
    workerPermissions: {
      read: true, // File system read access (required for simplifile)
      write: true, // File system write access
      net: true, // Network access (required for gleam/fetch)
      env: true, // Environment variable access
    },
    // Execution timeout in milliseconds (default: 30000)
    timeout: 30000,
  };
}
