{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixpkgs-unstable";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    flake-parts.url = "github:hercules-ci/flake-parts";
    systems.url = "github:nix-systems/default";
    git-hooks-nix.url = "github:cachix/git-hooks.nix";
    devenv.url = "github:cachix/devenv";
    rust-overlay.url = "github:oxalica/rust-overlay";
    deno-overlay.url = "github:haruki7049/deno-overlay";
  };

  outputs =
    inputs@{
      self,
      systems,
      nixpkgs,
      flake-parts,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.treefmt-nix.flakeModule
        inputs.git-hooks-nix.flakeModule
        inputs.devenv.flakeModule
      ];
      systems = import inputs.systems;

      perSystem =
        {
          config,
          pkgs,
          system,
          ...
        }:
        let
          stdenv = pkgs.stdenv;

	  rustPlatform = pkgs.makeRustPlatform {
	    cargo = pkgs.rust-bin.nightly.latest.default;
	    rustc = pkgs.rust-bin.nightly.latest.default;
           };

	  gleam = rustPlatform.buildRustPackage rec {
	    pname = "gleam";
	    version = "1.9.1";
	    src = pkgs.fetchFromGitHub {
	      owner = "gleam-lang";
	      repo = "gleam";
	      rev = "v${version}";
	      hash = "sha256-6vYVUdQST49TNctO9Y/XrRFyJ6hXng85SsO+4JBn1GA=";
	    };

	    useFetchCargoVendor = true;
	    cargoHash = "sha256-arVtNxcYDVKRTGe9won6zb30wCxMD6MtsGs25UmOPjM="; 

	    auditable = false;
            doCheck = false;
	  };

          git-secrets' = pkgs.writeShellApplication {
            name = "git-secrets";
            runtimeInputs = [ pkgs.git-secrets ];
            text = ''
              git secrets --scan
            '';
          };
        in
        {
	  _module.args.pkgs = import inputs.nixpkgs {
              inherit system;
              overlays = [
		inputs.rust-overlay.overlays.default
		inputs.deno-overlay.overlays.deno-overlay
              ];
              config = { };
            };

          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              nixfmt.enable = true;
            };

            settings.formatter = { };
          };

          pre-commit = {
            check.enable = true;
            settings = {
              hooks = {
                treefmt.enable = true;
                ripsecrets.enable = true;
                git-secrets = {
                  enable = true;
                  name = "git-secrets";
                  entry = "${git-secrets'}/bin/git-secrets";
                  language = "system";
                  types = [ "text" ];
                };
              };
            };
          };

          devenv.shells.default = {
            packages = [ pkgs.nil ];

            languages = {
              gleam = {
                enable = true;
		package = gleam;
              };
	      deno = {
		enable = true;
		package = pkgs.deno."2.3.1";
	      };
            };

            enterShell = '''';
          };
        };
    };
}
