import { installFetchProxy } from "../sandbox/fetch-proxy.ts";
import { loadPrebuiltRuntime } from "./prebuilt.ts";

export type SandboxRuntime = {
  execute(code: string, filename?: string): Promise<unknown>;
  getVFS(): {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    writeFileSync(path: string, data: string | Uint8Array): void;
  };
  iframe?: HTMLIFrameElement;
  terminate?: () => void;
};
/** What decides which sandbox a session can adopt: the same page, assets and bundles. */
export type SandboxOptions = {
  sandboxUrl: string;
  fetchProxy?: string | undefined;
  assetsUrl?: string | undefined;
  bundlesUrl?: string | undefined;
  buildUrl?: string | undefined;
};

let warm: { key: string; runtime: Promise<SandboxRuntime | undefined> } | undefined;

// The published package keeps its page assets in `assets/`: `dist/*.js` sits one
// level below it, and the bundled `assets/blast-web.js` is built with this as "./".
declare const BLAST_PACKAGED_ASSETS: string | undefined;
const packagedAssets = () =>
  new URL(
    typeof BLAST_PACKAGED_ASSETS === "string" ? BLAST_PACKAGED_ASSETS : "../assets/",
    import.meta.url,
  );

/** `path` under `assetsUrl`, which defaults to the package's own `assets/` directory. */
export const assetUrl = (options: Pick<SandboxOptions, "assetsUrl">, path: string) =>
  new URL(
    path,
    options.assetsUrl
      ? new URL(options.assetsUrl, (globalThis as { location?: { href: string } }).location?.href)
      : packagedAssets(),
  ).toString();
export function validateFetchProxy(value: string | undefined): void {
  if (value === undefined) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("fetchProxy must be an absolute HTTPS URL");
  }
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
  )
    throw new TypeError(
      "fetchProxy must be an absolute HTTPS URL (HTTP loopback is allowed for tests)",
    );
}
const keyOf = (options: SandboxOptions) =>
  [
    options.sandboxUrl,
    assetUrl(options, "./"),
    options.bundlesUrl,
    options.buildUrl,
    options.fetchProxy,
  ].join("\n");

const base64 = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
};

/**
 * Writes files into the sandbox's own file system before a command runs.
 * Writes to `getVFS()` never reach it (the sandbox page keeps its own
 * VirtualFS, and almostnode's sync would decode binary files as text), and a
 * message posted to the frame right after `createRuntime` can still land on
 * its initial `about:blank`. `execute` is the channel every command already
 * runs through, so the files go as one script, base64 for exact bytes.
 */
export async function writeSandboxFiles(
  runtime: Pick<SandboxRuntime, "execute">,
  files: ReadonlyArray<readonly [string, string | Uint8Array]>,
): Promise<void> {
  const encoded = JSON.stringify(files.map(([path, value]) => [path, base64(value)]));
  await runtime.execute(
    `const fs = require("fs");
for (const [path, data] of ${encoded}) {
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")) || "/", { recursive: true });
  fs.writeFileSync(path, Buffer.from(data, "base64"));
}
module.exports = null;`,
    "/blast/write-files.cjs",
  );
}

export function disposeSandbox(runtime: SandboxRuntime | undefined) {
  try {
    runtime?.terminate?.();
  } catch {
    // A sandbox that never finished starting has nothing to terminate.
  }
  runtime?.iframe?.remove();
}

/**
 * A cross-origin almostnode sandbox (decision 0013). `data-blast` on its frame
 * says whether it is idle (`warm`) or runs a command (`session`). The prebuilt
 * runtime, when the bundle index has one, loads before any command code.
 */
async function createSandbox(options: SandboxOptions, kind: "warm" | "session") {
  validateFetchProxy(options.fetchProxy);
  const almost = (await import(/* @vite-ignore */ assetUrl(options, "almostnode.mjs"))) as {
    VirtualFS: new () => unknown;
    createRuntime(vfs: unknown, options: { sandbox: string }): Promise<SandboxRuntime>;
  };
  const runtime = await almost.createRuntime(new almost.VirtualFS(), {
    sandbox: options.sandboxUrl,
  });
  runtime.iframe?.setAttribute("data-blast", kind);
  try {
    if (options.fetchProxy !== undefined)
      await runtime.execute(
        `(${installFetchProxy.toString()})(${JSON.stringify(options.fetchProxy)}); module.exports = null;`,
        "/blast/fetch-proxy.cjs",
      );
    const code = options.bundlesUrl
      ? await loadPrebuiltRuntime({ bundlesUrl: options.bundlesUrl, buildUrl: options.buildUrl })
      : undefined;
    if (code) await runtime.execute(`${code}\nmodule.exports = null;`, "/runtime.cjs");
  } catch (error) {
    disposeSandbox(runtime);
    throw error;
  }
  return runtime;
}

/** Starts a sandbox now so the next `mount()` with the same options skips that wait. */
export function prewarm(options: SandboxOptions): void {
  validateFetchProxy(options.fetchProxy);
  const key = keyOf(options);
  if (warm?.key === key) return;
  const previous = warm;
  warm = { key, runtime: createSandbox(options, "warm").catch(() => undefined) };
  void previous?.runtime.then(disposeSandbox);
}

/** The warm sandbox for these options if there is one, otherwise a new one. */
export async function acquireSandbox(options: SandboxOptions): Promise<SandboxRuntime> {
  if (warm?.key === keyOf(options)) {
    const pending = warm.runtime;
    warm = undefined;
    const runtime = await pending;
    if (runtime) {
      runtime.iframe?.setAttribute("data-blast", "session");
      return runtime;
    }
  }
  return createSandbox(options, "session");
}
