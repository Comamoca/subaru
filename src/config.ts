import type { SubaruConfig } from "./subaru_runner.ts";

export interface SubaruConfigFile extends SubaruConfig {
  preloadScripts?: Array<{
    moduleName: string;
    code?: string;
    url?: string;
    filePath?: string;
  }>;
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
        throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
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
  };
}
