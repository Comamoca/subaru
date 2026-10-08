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

| Preset     | Loaded Packages                            | Description                                       |
| ---------- | ------------------------------------------ | ------------------------------------------------- |
| `none`     | None                                       | No builtin packages (equivalent to `--no-stdlib`) |
| `minimal`  | gleam_stdlib                               | Core types and functions only                     |
| `standard` | gleam_stdlib, gleam_javascript, gleam_json | Core + JavaScript interop + JSON                  |
| `full`     | All 8 packages                             | Full standard library (default)                   |

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

### Dependency Resolution

Listed packages are resolved together with everything they depend on, so only
the packages you actually import need to be named. Versions are picked the way
`gleam deps download` picks them: the newest release every requirement in the
graph allows.

```json
{
  "standardLibrary": {
    "packages": ["sqlode"]
  }
}
```

`sqlode` alone pulls in `argv`, `glint`, `gleam_regexp`, `yay`, `snag`,
`gleam_community_colour` and `gleam_community_ansi` at compatible versions.

Set `resolve` to `false` to go back to loading only what is listed, with no
transitive dependencies.

### Package Sources

A package can come from Hex.pm, from a git repository or from a local
directory. Git access uses [isomorphic-git](https://isomorphic-git.org), so no
`git` binary is required.

```json
{
  "standardLibrary": {
    "baseDir": ".",
    "packages": [
      "lustre",
      { "name": "gleam_otp", "version": "0.10.0" },
      { "name": "argv", "git": "https://github.com/lpil/argv", "ref": "v1.1.0" },
      { "name": "mylib", "path": "./libs/mylib" }
    ]
  }
}
```

| Source | Keys                                  | Version                                  | Dependency information |
| ------ | ------------------------------------- | ---------------------------------------- | ---------------------- |
| Hex.pm | `version` (optional)                  | Negotiated during resolution             | Hex registry           |
| Git    | `git` + `ref` (branch, tag or commit) | Taken from the repository's `gleam.toml` | That `gleam.toml`      |
| Local  | `path`                                | Taken from the directory's `gleam.toml`  | That `gleam.toml`      |

- `ref` is resolved to a commit id, so a branch name still pins one revision per run.
- `path` is relative to `baseDir` (default: the current directory).
- Local packages are read in place and never cached, so edits take effect on the next run.
- Git clones are cached under `~/.cache/subaru/git/<repo>/<commit>/`.

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

The `version` field accepts any Hex requirement, not just an exact version:
`">= 1.0.0 and < 2.0.0"`, `"~> 1.2"` and `"~> 0.34 or ~> 1.0"` all work.

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
Resolution also caches the Hex registry entry of each package it looks at under
`~/.cache/subaru/registry/` (revalidated with an ETag), and git packages under
`~/.cache/subaru/git/`.

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
- **isomorphic-git** - Git access for git-sourced packages, without a `git` binary

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
