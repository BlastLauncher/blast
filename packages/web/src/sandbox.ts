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
  assetsUrl?: string | undefined;
  bundlesUrl?: string | undefined;
  buildUrl?: string | undefined;
};

let warm: { key: string; runtime: Promise<SandboxRuntime | undefined> } | undefined;

export const assetUrl = (options: Pick<SandboxOptions, "assetsUrl">, path: string) =>
  new URL(path, new URL(options.assetsUrl ?? "./", location.href)).toString();
const keyOf = (options: SandboxOptions) =>
  [options.sandboxUrl, assetUrl(options, "./"), options.bundlesUrl, options.buildUrl].join("\n");

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
  const almost = (await import(/* @vite-ignore */ assetUrl(options, "almostnode.mjs"))) as {
    VirtualFS: new () => unknown;
    createRuntime(vfs: unknown, options: { sandbox: string }): Promise<SandboxRuntime>;
  };
  const runtime = await almost.createRuntime(new almost.VirtualFS(), {
    sandbox: options.sandboxUrl,
  });
  runtime.iframe?.setAttribute("data-blast", kind);
  try {
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
