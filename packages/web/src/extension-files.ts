import type { BrowserFetch } from "./browser-install.ts";
import { canUseLocalFixture, isTextExtension, parseExtensionSource } from "./source.ts";

export type BrowserFile = string | Uint8Array;
export type FetchedExtension = {
  files: Map<string, BrowserFile>;
  manifest: Record<string, unknown>;
  lockfile?: string;
  root: string;
};
export type FetchExtensionOptions = {
  fetch?: BrowserFetch;
  /** Base URL of `<name>/__files` fixture listings; omit to always use GitHub. */
  fixturesUrl?: string | undefined;
};

const githubApiPath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const rateLimited = (response: Response) =>
  response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";

/** `raycast/extensions/<name>` is the embedding shorthand for a Store extension. */
export function resolveExtensionSource(value: string): string {
  const match = /^raycast\/extensions\/([^/]+)$/.exec(value.trim());
  return match?.[1] ?? value;
}

/** Fetches an extension's files from a local fixture server or GitHub. */
export async function fetchExtensionFiles(
  source: string,
  options: FetchExtensionOptions = {},
): Promise<FetchedExtension> {
  const request = options.fetch ?? ((input, init) => fetch(input, init));
  const parsed = parseExtensionSource(resolveExtensionSource(source));
  const files = new Map<string, BrowserFile>();
  const read = async (path: string, url: string) => {
    const response = await request(url);
    if (!response.ok) {
      if (rateLimited(response))
        throw new Error("GitHub API rate limit reached; try again later or use a local fixture");
      throw new Error(`Unable to fetch ${path} (${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    files.set(`/${path}`, isTextExtension(path) ? new TextDecoder().decode(bytes) : bytes);
  };
  let root = parsed.path;
  let paths: string[] = [];
  if (canUseLocalFixture(parsed, options.fixturesUrl !== undefined)) {
    const localBase = `${options.fixturesUrl}${encodeURIComponent(parsed.path.replace(/^extensions\//, ""))}`;
    const listing = await request(`${localBase}/__files`).catch(() => undefined);
    if (listing?.ok) {
      paths = (await listing.json()) as string[];
      root = parsed.path.replace(/^extensions\//, "");
      for (const path of paths) await read(path, `${localBase}/${path}`);
    }
  }
  if (paths.length === 0) {
    const list = async (path: string): Promise<string[]> => {
      const response = await request(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${githubApiPath(path)}?ref=${encodeURIComponent(parsed.ref)}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) {
        if (rateLimited(response))
          throw new Error("GitHub API rate limit reached; try again later or use a local fixture");
        throw new Error(`Unable to list GitHub extension files (${response.status})`);
      }
      const entries = (await response.json()) as Array<{ path?: string; type?: string }>;
      const result: string[] = [];
      for (const entry of entries) {
        if (!entry.path || entry.path.split("/").includes("node_modules")) continue;
        if (entry.type === "dir") result.push(...(await list(entry.path)));
        else if (entry.type === "file") result.push(entry.path.slice(parsed.path.length + 1));
      }
      return result;
    };
    paths = await list(parsed.path);
    if (!paths.includes("package.json")) throw new Error("Extension package.json was not found");
    for (const path of paths)
      await read(
        path,
        `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(parsed.ref)}/${parsed.path}/${path}`,
      );
  }
  const manifest = JSON.parse(String(files.get("/package.json"))) as Record<string, unknown>;
  const lockfile = files.get("/package-lock.json");
  return { files, manifest, root, ...(typeof lockfile === "string" ? { lockfile } : {}) };
}

/**
 * Where an extension file lives under the command's assets directory, or
 * undefined when the bundle already holds it: `assets/*` sit at its top,
 * `src/` data files (not code) keep their place below it, and other files
 * (`package.json`) keep their path.
 */
export function assetRelativePath(path: string): string | undefined {
  if (path.includes("/node_modules/")) return undefined;
  if (path.startsWith("/assets/")) return path.slice("/assets/".length) || undefined;
  if (path.startsWith("/src/"))
    return /\.(?:cjs|css|html?|js|jsx|mjs|ts|tsx)$/iu.test(path)
      ? undefined
      : path.slice("/src/".length);
  return path.replace(/^\//u, "") || undefined;
}

/** An extension's files keyed by `assetRelativePath`, as prebuilt bundles list them. */
export function extensionAssets(
  files: ReadonlyMap<string, BrowserFile>,
): Array<[string, BrowserFile]> {
  return [...files].flatMap(([path, value]): Array<[string, BrowserFile]> => {
    const relative = assetRelativePath(path);
    return relative ? [[relative, value]] : [];
  });
}

/**
 * The files a command's sandbox needs before it runs: the extension's assets
 * (keyed by `assetRelativePath`) under `assetsPath` (decision 0013), its
 * `package.json` also one level up (bundled code reads
 * `__dirname/../package.json`), and markers that create the assets and support
 * directories.
 */
export function sandboxFiles(
  assets: Iterable<readonly [string, BrowserFile]>,
  assetsPath: string,
  supportPath: string,
): Array<[string, BrowserFile]> {
  const result: Array<[string, BrowserFile]> = [
    [`${supportPath}/.keep`, ""],
    [`${assetsPath}/.keep`, ""],
  ];
  for (const [relative, value] of assets) {
    result.push([`${assetsPath}/${relative}`, value]);
    if (relative === "package.json")
      result.push([`${assetsPath.slice(0, assetsPath.lastIndexOf("/"))}/package.json`, value]);
  }
  return result;
}

/** The source file a command's bundle starts from. */
export function commandEntry(files: Map<string, BrowserFile>, name: string): string {
  for (const extension of ["tsx", "ts", "jsx", "js"]) {
    const path = `/src/${name}.${extension}`;
    if (files.has(path)) return path;
  }
  if (files.has("/src/index.tsx")) return "/src/index.tsx";
  throw new Error(`Command source not found for ${name}`);
}

/** Command names a manifest declares, in order. */
export function manifestCommands(manifest: Record<string, unknown>): string[] {
  const commands = manifest.commands;
  return Array.isArray(commands)
    ? commands.flatMap((command: { name?: unknown }) =>
        typeof command?.name === "string" ? [command.name] : [],
      )
    : [];
}
