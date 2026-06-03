export interface WasmApi {
  reset_filesystem: (projectId: number) => void;
  write_module: (projectId: number, name: string, code: string) => void;
  write_file: (projectId: number, path: string, content: string) => void;
  compile_package: (projectId: number, target: "javascript" | "erlang") => void;
  read_compiled_javascript: (projectId: number, name: string) => string | undefined;
  read_compiled_erlang: (projectId: number, name: string) => string | undefined;
  pop_warning: (projectId: number) => string | undefined;
  reset_warnings: (projectId: number) => void;
  read_file_bytes: (projectId: number, path: string) => Uint8Array | undefined;
}

export class WasmModule {
  private api: WasmApi | null = null;

  async initialize(wasmPath: string, debug: boolean = false): Promise<void> {
    const wasmModulePath = `file://${wasmPath}/gleam_wasm.js`;
    const { default: init, initialise_panic_hook, ...rest } = await import(wasmModulePath);

    const wasmFile = await Deno.readFile(`${wasmPath}/gleam_wasm_bg.wasm`);
    await init({ module_or_path: wasmFile });

    initialise_panic_hook(debug);

    this.api = rest as WasmApi;
  }

  get isInitialized(): boolean {
    return this.api !== null;
  }

  resetFilesystem(projectId: number): void {
    this.api!.reset_filesystem(projectId);
  }

  resetWarnings(projectId: number): void {
    this.api!.reset_warnings(projectId);
  }

  writeModule(projectId: number, name: string, code: string): void {
    this.api!.write_module(projectId, name, code);
  }

  writeFile(projectId: number, path: string, content: string): void {
    this.api!.write_file(projectId, path, content);
  }

  compile(projectId: number, target: "javascript" | "erlang"): void {
    this.api!.compile_package(projectId, target);
  }

  readCompiledJavaScript(projectId: number, name: string): string | undefined {
    return this.api!.read_compiled_javascript(projectId, name);
  }

  readCompiledErlang(projectId: number, name: string): string | undefined {
    return this.api!.read_compiled_erlang(projectId, name);
  }

  popWarning(projectId: number): string | undefined {
    return this.api!.pop_warning(projectId);
  }

  readFileBytes(projectId: number, path: string): Uint8Array | undefined {
    return this.api!.read_file_bytes(projectId, path);
  }
}
