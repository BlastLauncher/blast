// The subset of tsconfig `compilerOptions` that affects module resolution:
// `baseUrl` and `paths`. Extensions import their own modules through them
// (control-d's `common/...`), and esbuild never gets to apply them itself —
// the dependency plugin resolves every bare specifier first — so the plugin
// probes them here. Aliasing never reads outside the extension directory:
// `extends` targets that are package presets are skipped with a warning and
// candidate paths are probed only inside the extension.
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

/** File extensions tried for an extensionless alias target, esbuild's order. */
const RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];

export type TsconfigAliasResolver = {
  /**
   * Absolute path of an existing file inside the extension directory that a
   * bare specifier resolves to through `paths` or `baseUrl`, else `undefined`.
   */
  resolve(specifier: string): Promise<string | undefined>;
  /** One line per non-fatal problem found while loading the tsconfig chain. */
  warnings: string[];
};

/** A `compilerOptions` value together with the config file that declared it. */
type Declared = { value: unknown; directory: string };

type Chain = { baseUrl?: Declared; paths?: Declared };

async function kindOf(path: string): Promise<"file" | "directory" | undefined> {
  try {
    const stats = await stat(path);
    return stats.isFile() ? "file" : stats.isDirectory() ? "directory" : undefined;
  } catch {
    return undefined;
  }
}

/** True when `path` is strictly inside `directory` (lexical, symlink-blind). */
function inside(directory: string, path: string): boolean {
  const rel = relative(directory, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Loads one tsconfig chain position: parents first (`extends`, lowest
 * precedence first), then the file's own `compilerOptions` overriding per key.
 * Returns `undefined` when the file cannot be used; every skip is explained
 * in `warnings` so a broken config degrades to "no aliasing", never to a
 * failed bundle.
 */
async function loadChain(
  file: string,
  extensionDir: string,
  stack: Set<string>,
  warnings: string[],
): Promise<Chain | undefined> {
  const path = resolve(file);
  // A cycle is an extension bug; stop instead of looping.
  if (stack.has(path)) return undefined;
  const name = relative(extensionDir, path) || path;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    warnings.push(`Blast skipped unreadable tsconfig ${name} for path aliases`);
    return undefined;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    warnings.push(`Blast skipped tsconfig ${name}: not valid JSON, so path aliases are off`);
    return undefined;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  const config = json as { extends?: unknown; compilerOptions?: unknown };
  stack.add(path);
  const chain: Chain = {};
  const parents = Array.isArray(config.extends)
    ? config.extends
    : config.extends === undefined
      ? []
      : [config.extends];
  for (const parent of parents) {
    // Package presets (`@tsconfig/strictest/tsconfig.json`) are resolved by
    // tsc through node_modules, which aliasing never reads.
    if (typeof parent !== "string" || (!parent.startsWith(".") && !isAbsolute(parent))) {
      warnings.push(
        `Blast ignored the tsconfig extends target ${JSON.stringify(String(parent))}: ` +
          "outside the extension, so its path aliases are off",
      );
      continue;
    }
    let parentFile = resolve(join(path, ".."), parent);
    if ((await kindOf(parentFile)) === "directory") parentFile = join(parentFile, "tsconfig.json");
    const inherited = await loadChain(parentFile, extensionDir, stack, warnings);
    if (inherited?.baseUrl) chain.baseUrl = inherited.baseUrl;
    if (inherited?.paths) chain.paths = inherited.paths;
  }
  stack.delete(path);
  if (typeof config.compilerOptions === "object" && config.compilerOptions !== null) {
    const options = config.compilerOptions as Record<string, unknown>;
    for (const key of ["baseUrl", "paths"] as const) {
      if (options[key] !== undefined)
        (chain[key] as Declared | undefined) = { value: options[key], directory: join(path, "..") };
    }
  }
  return chain;
}

function parsePaths(
  declared: Declared | undefined,
  baseUrl: string | undefined,
): [pattern: string, targets: string[]][] {
  const value = declared?.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  // `paths` targets are relative to `baseUrl` when it is set (in any config
  // of the chain), else to the config that declared `paths` (TS ≥ 4.1).
  const base = baseUrl ?? declared!.directory;
  const patterns: [string, string[]][] = [];
  for (const [pattern, targets] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(targets)) continue;
    const absolute = targets
      .filter((target): target is string => typeof target === "string")
      .map((target) => resolve(base, target));
    if (absolute.length > 0) patterns.push([pattern, absolute]);
  }
  return patterns;
}

/** Exact patterns first, then wildcards by longest prefix, then longest suffix. */
function matchPatterns(
  patterns: [string, string[]][],
  specifier: string,
): { targets: string[]; capture: string }[] {
  const matches: { targets: string[]; capture: string; prefix: number; suffix: number }[] = [];
  for (const [pattern, targets] of patterns) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (pattern === specifier)
        matches.push({ targets, capture: "", prefix: Infinity, suffix: 0 });
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    ) {
      matches.push({
        targets,
        capture: specifier.slice(prefix.length, specifier.length - suffix.length),
        prefix: prefix.length,
        suffix: suffix.length,
      });
    }
  }
  return matches
    .toSorted((a, b) => b.prefix - a.prefix || b.suffix - a.suffix)
    .map(({ targets, capture }) => ({ targets, capture }));
}

async function firstFile(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if ((await kindOf(candidate)) === "file") return candidate;
  }
  return undefined;
}

/** A candidate is a file, a file with an implied extension, or a directory. */
async function probe(candidate: string): Promise<string | undefined> {
  const kind = await kindOf(candidate);
  if (kind === "file") return candidate;
  if (kind === "directory") {
    // tsc honours a directory's package.json `main`; index files otherwise.
    let main: string | undefined;
    try {
      const manifest = JSON.parse(await readFile(join(candidate, "package.json"), "utf8")) as {
        main?: unknown;
      };
      if (typeof manifest.main === "string") main = manifest.main;
    } catch {
      // No package.json: fall back to index files.
    }
    if (main !== undefined) {
      const direct = await firstFile([join(candidate, main)]);
      if (direct) return direct;
      const implied = await firstFile(RESOLVE_EXTENSIONS.map((ext) => join(candidate, main + ext)));
      if (implied) return implied;
    }
    return firstFile(RESOLVE_EXTENSIONS.map((ext) => join(candidate, `index${ext}`)));
  }
  return firstFile(RESOLVE_EXTENSIONS.map((ext) => candidate + ext));
}

/**
 * Reads the extension's tsconfig chain and returns a resolver for bare
 * specifiers, or `undefined` when the extension has no `baseUrl`/`paths`.
 */
export async function loadTsconfigAliases(
  extensionDir: string,
): Promise<TsconfigAliasResolver | undefined> {
  const root = join(extensionDir, "tsconfig.json");
  // Most extensions have no tsconfig; that is normal, not a warning.
  if ((await kindOf(root)) !== "file") return undefined;
  const warnings: string[] = [];
  const chain = await loadChain(root, extensionDir, new Set(), warnings);
  if (!chain)
    // The config exists but cannot be used at all; resolution stays
    // package-only and the warning explains why.
    return {
      warnings,
      resolve: () => Promise.resolve(undefined),
    };
  const baseUrlField = chain.baseUrl;
  const baseUrl =
    typeof baseUrlField?.value === "string"
      ? resolve(baseUrlField.directory, baseUrlField.value)
      : undefined;
  const patterns = parsePaths(chain.paths, baseUrl);
  if (!baseUrl && patterns.length === 0) return undefined;
  const extensionDirAbsolute = resolve(extensionDir);
  return {
    warnings,
    async resolve(specifier: string): Promise<string | undefined> {
      // `paths` wins over `baseUrl`, which wins over packages — as tsc does.
      for (const { targets, capture } of matchPatterns(patterns, specifier)) {
        for (const template of targets) {
          const candidate = template.replace("*", capture);
          if (!inside(extensionDirAbsolute, candidate)) continue;
          const found = await probe(candidate);
          if (found) return found;
        }
      }
      if (baseUrl !== undefined) {
        const candidate = join(baseUrl, specifier);
        if (inside(extensionDirAbsolute, candidate)) {
          const found = await probe(candidate);
          if (found) return found;
        }
      }
      return undefined;
    },
  };
}
