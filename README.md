<div align="center">

![Last commit](https://img.shields.io/github/last-commit/Comamoca/subaru?style=flat-square)
![Repository Stars](https://img.shields.io/github/stars/Comamoca/subaru?style=flat-square)
![Issues](https://img.shields.io/github/issues/Comamoca/subaru?style=flat-square)
![Open Issues](https://img.shields.io/github/issues-raw/Comamoca/subaru?style=flat-square)
![Bug Issues](https://img.shields.io/github/issues/Comamoca/subaru/bug?style=flat-square)

<img src="https://emoji2svg.deno.dev/api/🦊" alt="eyecatch" height="100">

# subaru

A Gleam WASM runner that allows executing Gleam code dynamically using WebAssembly.

<br>
<br>


</div>

<div align="center">

</div>

## 🚀 How to use

```sh
# Execute Gleam file directly
deno task cli example.gleam

# Execute code from string
deno task cli --code 'import gleam/io
pub fn main() { io.println("Hello from WASM!") }'

# Execute remote script
deno task cli --url https://example.com/script.gleam
```

- Execute Gleam files directly without compilation
- Run Gleam code from strings, files, or remote URLs  
- Dynamic compilation using Gleam's WebAssembly compiler
- Worker-based execution for safe code isolation
- Configurable logging and debug output

## ⬇️  Install

### Prerequisites
- [Deno](https://deno.land/) - Modern runtime for JavaScript and TypeScript
- [Gleam](https://gleam.run/) - For local Gleam development (optional)

### From GitHub
```sh
# Clone repository
git clone https://github.com/Comamoca/subaru
cd subaru

# Setup (download Gleam WASM compiler)
deno task setup

# Run CLI
deno task cli --help
```

### As Gleam Package
```sh
gleam add subaru@1
```

```gleam
import subaru

pub fn main() {
  // Use subaru functions here
}
```

### From Source
```sh
git clone https://github.com/Comamoca/subaru
cd subaru
deno task setup
gleam build
```

## ⛏️   Development

```sh
# Using Nix (recommended)
nix develop

# Or with direnv
direnv allow

# Manual setup
deno task setup

# Development commands
deno task dev        # Setup and run development environment
deno task test       # Run all tests
deno task example    # Run usage examples
deno task fmt        # Format code
deno task lint       # Lint code
deno task check      # Type check
```

## 📝 Todo

- [ ] Add more comprehensive error handling
- [ ] Implement module caching for better performance
- [ ] Add support for custom Gleam compiler versions
- [ ] Create VSCode extension for Gleam WASM execution
- [ ] Add streaming execution for large outputs
- [ ] Implement code completion and syntax highlighting
- [ ] Add benchmark suite for performance testing
- [ ] Support for additional output formats (JSON, XML, etc.)

## 📜 License

MIT License - see [LICENSE](./LICENSE.md) file for details.

This project is open source and available under the MIT License.

### 🧩 Modules

#### TypeScript/Deno Dependencies
- **Deno Standard Library** - File system, path utilities, testing
- **Gleam WASM Compiler** - Dynamic Gleam compilation to JavaScript

#### Gleam Dependencies
- **gleam_stdlib** - Standard library functions for Gleam
- **gleeunit** - Testing framework for Gleam projects

#### Development Environment
- **Nix Flakes** - Reproducible development environment management
- **devenv** - Development shell configuration and tooling
- **pre-commit hooks** - Security scanning (git-secrets, ripsecrets)
- **treefmt** - Automated code formatting across languages

## 👏 Affected projects

- [Gleam Language](https://gleam.run/) - Functional language for building type-safe systems that inspired this project
- [Deno](https://deno.land/) - Modern runtime that enabled TypeScript-first development
- [WebAssembly](https://webassembly.org/) - Binary instruction format that makes dynamic compilation possible

## 💕 Special Thanks

- **Gleam Team** - For creating an amazing functional language with excellent WASM support
- **Deno Team** - For providing a fantastic development experience with TypeScript
- **WebAssembly Community** - For enabling dynamic compilation and safe execution in browsers
- **Nix Community** - For reproducible development environments and excellent tooling
- **Open Source Contributors** - For all the libraries and tools that made this project possible
