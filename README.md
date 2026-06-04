<div align="center">

![Last commit](https://img.shields.io/github/last-commit/Comamoca/subaru?style=flat-square)
![Repository Stars](https://img.shields.io/github/stars/Comamoca/subaru?style=flat-square)
![Issues](https://img.shields.io/github/issues/Comamoca/subaru?style=flat-square)
![Open Issues](https://img.shields.io/github/issues-raw/Comamoca/subaru?style=flat-square)
![Bug Issues](https://img.shields.io/github/issues/Comamoca/subaru/bug?style=flat-square)

<img src="https://emoji2svg.deno.dev/api/✨️" alt="eyecatch" height="100">

# subaru

A Gleam WASM runner that allows executing Gleam code dynamically using WebAssembly.

<br>
<br>

</div>

<div align="center">

<img src="./assets/quote.jpg" alt="Quote" width="50%">

</div>

## 🚀 How to use

```sh
# Using installed version (after deno install)
subaru example.gleam
subaru --code 'import gleam/io
pub fn main() { io.println("Hello from WASM!") }'

# Using direct URL execution
deno run --allow-all https://github.com/Comamoca/subaru/raw/main/src/cli.ts example.gleam

# Using local development version
deno task cli example.gleam
deno task cli --code 'import gleam/io
pub fn main() { io.println("Hello from WASM!") }'

# Execute remote script
subaru --url https://example.com/script.gleam
```

- Execute Gleam files directly without compilation
- Run Gleam code from strings, files, or remote URLs
- Dynamic compilation using Gleam's WebAssembly compiler
- Worker-based execution for safe code isolation
- Configurable logging and debug output
- **Preloaded Standard Libraries** - Automatic access to essential Gleam modules
- **Echo Keyword Support** - Full support for Gleam v1.11.0's debugging features

## ⬇️ Install

### Prerequisites

- [Deno](https://deno.land/) - Modern runtime for JavaScript and TypeScript
- [Gleam](https://gleam.run/) - For local Gleam development (optional)

### Using deno install (Recommended)

```sh
# Install globally
deno install --allow-all -n subaru https://github.com/Comamoca/subaru/raw/main/src/cli.ts

# Run from anywhere
subaru --help
subaru example.gleam
subaru --code 'import gleam/io
pub fn main() { io.println("Hello!") }'
```

### Direct URL execution

```sh
# Run directly from GitHub without installation
deno run --allow-all https://github.com/Comamoca/subaru/raw/main/src/cli.ts --help

# Execute Gleam code
deno run --allow-all https://github.com/Comamoca/subaru/raw/main/src/cli.ts --code 'import gleam/io
pub fn main() { io.println("Hello from URL!") }'
```

### From GitHub (Local Development)

```sh
# Clone repository
git clone https://github.com/Comamoca/subaru
cd subaru

# Setup (download Gleam WASM compiler)
deno task setup

# Run CLI
deno task cli --help
```

### From Source

```sh
git clone https://github.com/Comamoca/subaru
cd subaru
deno task setup
```

## ⛏️ Development

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

### Preloaded Libraries Usage Example

All these libraries are automatically available without imports:

```gleam
import gleam/io
import gleam/list
import gleam/string
import gleam/int
import gleam/result

pub fn main() {
  // List operations
  [1, 2, 3, 4, 5]
  |> list.map(fn(x) { x * 2 })
  |> echo  // [2, 4, 6, 8, 10]
  |> list.filter(fn(x) { x > 5 })
  |> echo  // [6, 8, 10]
  
  // String operations
  "Hello, Gleam!"
  |> string.uppercase()
  |> io.println()  // HELLO, GLEAM!
  
  // Result operations
  let result = case int.parse("42") {
    Ok(num) -> "Parsed: " <> int.to_string(num)
    Error(_) -> "Parse failed"
  }
  io.println(result)  // Parsed: 42
}
```

## 📦 Package Management

Subaru automatically loads Gleam packages from [Hex.pm](https://hex.pm) when executing code. Builtin packages are loaded by default, and you can add third-party packages or customize which packages are loaded.

### Preset System

The `preset` option controls which builtin packages are automatically loaded:

| Preset | Loaded Packages | Description |
|--------|----------------|-------------|
| `none` | None | No builtin packages (equivalent to `--no-stdlib`) |
| `minimal` | gleam_stdlib | Core types and functions only |
| `standard` | gleam_stdlib, gleam_javascript, gleam_json | Core + JavaScript interop + JSON |
| `full` | All 8 packages | Full standard library (default) |

The 8 builtin packages are: `gleam_stdlib`, `gleam_javascript`, `gleam_json`, `gleam_http`, `gleam_fetch`, `plinth`, `filepath`, `simplifile`.

### Configuration Example

Create a `subaru.config.json` file:

```json
{
  "standardLibrary": {
    "preset": "full",
    "packages": [
      "lustre",
      { "name": "gleam_otp", "version": "0.10.0" }
    ],
    "cache": {
      "enabled": true,
      "ttl": 604800
    }
  }
}
```

### Version Pinning

Pin package versions for reproducible builds:

```json
{
  "standardLibrary": {
    "packages": [
      { "name": "gleam_json", "version": "2.0.0" }
    ]
  }
}
```

### Selective Module Loading

Use `include` and `exclude` to load only specific modules from a package:

```json
{
  "standardLibrary": {
    "packages": [
      {
        "name": "gleam_http",
        "include": ["gleam/http", "gleam/http/request"]
      }
    ]
  }
}
```

### Cache Management

Packages are cached locally at `~/.cache/subaru/packages/` (7-day TTL by default).

```sh
# Clear package cache only
subaru --clean-package-cache

# Clear entire Subaru cache (WASM compiler + packages)
subaru --clean-cache
```

### CLI Flags

- `--no-stdlib` — Disable all builtin package loading
- `--clean-package-cache` — Remove Hex.pm package cache only
- `--clean-cache` — Remove all cache directories

### Generate Example Config

```sh
subaru --init-config
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

#### Preloaded Gleam Libraries

- [gleam_stdlib](https://hexdocs.pm/gleam_stdlib/)
- [gleam_javascript](https://hexdocs.pm/gleam_javascript/index.html)

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
