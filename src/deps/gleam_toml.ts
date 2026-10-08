/**
 * gleam.toml parsing
 *
 * The Hex registry carries dependency requirements for every published release,
 * so hex-sourced packages never need their gleam.toml read. Git and local
 * packages have no registry entry, and for them gleam.toml is the only place
 * their version and requirements exist.
 *
 * It also carries two things the registry does not have at all: the Gleam
 * compiler requirement, and the Deno permissions a package needs on the
 * JavaScript target.
 */

import { parse as parseToml } from "https://deno.land/std@0.220.0/toml/mod.ts";

/** How a dependency's source is spelled in gleam.toml. */
export type DependencySpec =
  | { source: "hex"; name: string; requirement: string }
  | { source: "git"; name: string; url: string; ref: string }
  | { source: "local"; name: string; path: string };

export interface DenoPermissions {
  allowAll?: boolean;
  allowRead?: boolean | string[];
  allowWrite?: boolean | string[];
  allowNet?: boolean | string[];
  allowEnv?: boolean | string[];
  allowRun?: boolean | string[];
}

export interface GleamToml {
  name: string;
  version: string;
  /** The `gleam` field, e.g. ">= 1.14.0". Absent in older packages. */
  gleamRequirement?: string;
  target?: string;
  dependencies: DependencySpec[];
  devDependencies: DependencySpec[];
  internalModules: string[];
  /** `[javascript.deno]`, used to derive least-privilege worker permissions. */
  denoPermissions?: DenoPermissions;
}

export class GleamTomlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GleamTomlError";
  }
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function permissionValue(value: unknown): boolean | string[] | undefined {
  if (typeof value === "boolean") return value;
  return asStringArray(value);
}

function parseDenoPermissions(javascript: unknown): DenoPermissions | undefined {
  if (typeof javascript !== "object" || javascript === null) return undefined;

  const deno = (javascript as Record<string, unknown>).deno;
  if (typeof deno !== "object" || deno === null) return undefined;

  const table = deno as Record<string, unknown>;
  const permissions: DenoPermissions = {
    allowAll: table.allow_all === true ? true : undefined,
    allowRead: permissionValue(table.allow_read),
    allowWrite: permissionValue(table.allow_write),
    allowNet: permissionValue(table.allow_net),
    allowEnv: permissionValue(table.allow_env),
    allowRun: permissionValue(table.allow_run),
  };

  const hasAny = Object.values(permissions).some((value) => value !== undefined);
  return hasAny ? permissions : undefined;
}

function parseDependencyTable(table: unknown): DependencySpec[] {
  if (typeof table !== "object" || table === null) return [];

  return Object.entries(table as Record<string, unknown>).map(([name, value]) => {
    // Shorthand form: gleam_stdlib = ">= 0.44.0 and < 2.0.0"
    if (typeof value === "string") {
      return { source: "hex", name, requirement: value } as const;
    }

    if (typeof value !== "object" || value === null) {
      throw new GleamTomlError(`Unsupported dependency entry for ${name}`);
    }

    const entry = value as Record<string, unknown>;

    if (typeof entry.git === "string") {
      const ref = entry.ref ?? entry.rev ?? entry.tag ?? entry.branch;
      if (typeof ref !== "string") {
        throw new GleamTomlError(`Git dependency ${name} is missing a ref`);
      }
      return { source: "git", name, url: entry.git, ref } as const;
    }

    if (typeof entry.path === "string") {
      return { source: "local", name, path: entry.path } as const;
    }

    if (typeof entry.version === "string") {
      return { source: "hex", name, requirement: entry.version } as const;
    }

    throw new GleamTomlError(
      `Dependency ${name} has none of "version", "git" or "path"`,
    );
  });
}

export function parseGleamToml(text: string): GleamToml {
  let table: Record<string, unknown>;
  try {
    table = parseToml(text) as Record<string, unknown>;
  } catch (error) {
    throw new GleamTomlError(
      `Invalid gleam.toml: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const name = table.name;
  if (typeof name !== "string") {
    throw new GleamTomlError('gleam.toml is missing the "name" field');
  }

  return {
    name,
    version: typeof table.version === "string" ? table.version : "0.0.0",
    gleamRequirement: typeof table.gleam === "string" ? table.gleam : undefined,
    target: typeof table.target === "string" ? table.target : undefined,
    dependencies: parseDependencyTable(table.dependencies),
    devDependencies: parseDependencyTable(table["dev-dependencies"]),
    internalModules: asStringArray(table.internal_modules) ?? [],
    denoPermissions: parseDenoPermissions(table.javascript),
  };
}
