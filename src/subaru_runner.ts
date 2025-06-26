import { GleamRunner } from "./gleam_runner.ts";
import type { CompileResult, GleamRunnerConfig, RunResult } from "./gleam_runner.ts";

export interface SubaruConfig extends GleamRunnerConfig {
  timeout?: number;
}

export class Subaru {
  private runner: GleamRunner;
  private initialized: boolean = false;

  constructor(config: SubaruConfig = {}) {
    this.runner = new GleamRunner(config);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.runner.initialize();
    this.initialized = true;
  }

  async execute(gleamCode: string): Promise<RunResult> {
    if (!this.initialized) {
      await this.init();
    }

    return await this.runner.run(gleamCode);
  }

  async compile(gleamCode: string): Promise<CompileResult> {
    if (!this.initialized) {
      await this.init();
    }

    return await this.runner.compile(gleamCode);
  }

  async executeFromUrl(url: string): Promise<RunResult> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return {
          success: false,
          output: [],
          errors: [`Failed to fetch ${url}: ${response.status} ${response.statusText}`],
        };
      }

      const gleamCode = await response.text();
      return await this.execute(gleamCode);
    } catch (error) {
      return {
        success: false,
        output: [],
        errors: [`Failed to fetch ${url}: ${error}`],
      };
    }
  }

  // Convenience method for quick execution
  static async run(gleamCode: string, config?: SubaruConfig): Promise<RunResult> {
    const subaru = new Subaru(config);
    return await subaru.execute(gleamCode);
  }

  // Convenience method for remote script execution
  static async runFromUrl(url: string, config?: SubaruConfig): Promise<RunResult> {
    const subaru = new Subaru(config);
    return await subaru.executeFromUrl(url);
  }
}

// Export main types
export { CompileResult, RunResult };

// Default export
export default Subaru;
