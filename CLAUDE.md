# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "subaru" - a Gleam WASM runner that allows executing Gleam code dynamically using WebAssembly. The project uses:

- **Gleam**: Main programming language (functional language that compiles to Erlang/JavaScript)
- **Deno**: TypeScript/JavaScript runtime for the WASM runner
- **WASM**: WebAssembly version of Gleam compiler for dynamic compilation
- **Nix Flakes**: Development environment management with devenv
- **Pre-commit hooks**: Security scanning with git-secrets and ripsecrets

## Development Commands

### Setup

```bash
deno task setup     # Download Gleam WASM compiler
```

### Gleam Operations

```bash
gleam run      # Run the main Gleam application
gleam test     # Run Gleam tests using gleeunit
```

### WASM Runner Operations

```bash
# CLI usage
deno task cli --help                    # Show CLI help
deno task cli example.gleam             # Execute Gleam file directly (preferred)
deno task cli --file example.gleam     # Execute Gleam code from file (alternative)  
deno task cli --code "gleam_code_here"  # Execute Gleam code directly
deno task cli --url https://example.com/script.gleam  # Execute remote script

# Debug control (silent is default)
deno task cli --debug --code "..."      # Enable debug output
deno task cli --log-level error --code "..."   # Show compilation errors/warnings

# Configuration
deno task init-config                   # Create example config file
deno task cli --config my-config.json script.gleam  # Use custom config with direct file

# Examples and testing
deno task example                       # Run usage examples
deno task example:debug                 # Run debug mode examples
deno task example:preload               # Run preload scripts example
deno task test                          # Run Deno tests
```

### Development Environment

```bash
deno task dev        # Setup and run development environment
# OR use Nix/direnv for reproducible environment:
nix develop          # Enter the development shell (if using Nix)
direnv allow         # Auto-load development environment (if direnv is configured)
```

### Code Quality

```bash
deno task fmt            # Format TypeScript code
deno task lint           # Lint TypeScript code
deno task check          # Type check TypeScript code
deno task test           # Run Deno tests
deno task build-gleam    # Build Gleam project
deno task run-gleam      # Run Gleam project
deno task clean          # Clean generated files
nix run .#treefmt        # Format Nix code
git secrets --scan       # Scan for secrets (pre-commit hook)
```

**IMPORTANT**: Always run `deno fmt` and `deno test` during development before committing changes. These commands should be used frequently to catch formatting issues and test failures early.

## Project Structure

### Gleam Files

- `src/subaru.gleam`: Main Gleam application entry point
- `test/subaru_test.gleam`: Gleam test suite using gleeunit

### TypeScript/WASM Runner

- `src/gleam_runner.ts`: Core WASM runner implementation
- `src/subaru_runner.ts`: High-level API for Gleam code execution
- `src/cli.ts`: Command-line interface for the runner
- `test/subaru_runner_test.ts`: Deno tests for WASM functionality
- `examples/simple_usage.ts`: Usage examples

### Configuration & Scripts

- `gleam.toml`: Gleam project configuration and dependencies
- `deno.json`: Deno configuration and development task definitions
- `flake.nix`: Nix development environment with custom Gleam build
- `src/setup.ts`: WASM compiler setup script

## Architecture Notes

- **Dual Runtime**: Gleam for static compilation, Deno for dynamic WASM execution
- **WASM Integration**: Uses Gleam's WebAssembly compiler for dynamic code compilation
- **Worker-based Execution**: Isolates compiled JavaScript execution in Web Workers
- **CLI Interface**: Provides easy command-line access to WASM functionality
- **Testing Strategy**: Gleam tests for static code, Deno tests for WASM functionality
- **Custom Gleam Build**: The flake.nix builds Gleam v1.9.1 from source using Rust nightly
- **Security**: Pre-commit hooks scan for secrets using git-secrets and ripsecrets

## Key Features

- **Dynamic Compilation**: Compile Gleam code to JavaScript at runtime using WASM
- **Safe Execution**: Worker-based isolation for executed code (simplified version)
- **Multiple Interfaces**: CLI, programmatic API, and library usage
- **Remote Script Execution**: Execute Gleam scripts from URLs like `deno run`
- **Debug Control**: Configurable logging levels (silent by default, error, warn, info, debug, trace)
- **Preload Scripts**: Configure custom modules to be available in all compilations
- **Configuration Files**: JSON-based configuration with preload scripts and settings
- **Error Handling**: Comprehensive error reporting for compilation and runtime issues

## Configuration

Create a `subaru.config.json` file to customize behavior:

```bash
deno task init-config  # Creates example config
```

Example configuration:

```json
{
  "debug": false,
  "logLevel": "silent",
  "wasmPath": "./wasm-compiler",
  "preloadScripts": [
    {
      "moduleName": "my_utils",
      "code": "pub fn helper() { ... }"
    },
    {
      "moduleName": "remote_lib",
      "url": "https://example.com/lib.gleam"
    },
    {
      "moduleName": "local_lib",
      "filePath": "./libs/local.gleam"
    }
  ]
}
```

## Development Environment

The project uses a Nix flake with devenv for reproducible development:

- Custom-built Gleam 1.9.1 compiler
- Pre-commit hooks for security scanning
- Treefmt for code formatting
- Development shell with necessary tools

## Commit Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification for consistent commit messages.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting, semicolons, etc. (no functional changes)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or modifying tests
- `chore`: Build process, auxiliary tools, etc.
- `ci`: CI configuration changes
- `build`: Build system or external dependencies changes

### Examples

```
feat(cli): add warning color customization options
fix(wasm): resolve deprecated initialization API usage
docs(readme): update installation methods with deno install
ci: migrate from Gleam to Deno-only workflow
chore: remove unused Gleam project files
```

### Breaking Changes

Use `!` after type/scope or add `BREAKING CHANGE:` in footer:

```
feat!: change CLI argument format
feat(api)!: remove deprecated methods
```
