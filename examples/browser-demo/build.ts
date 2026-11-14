import { join } from "node:path";
import {
  buildWebAssets,
  depsModules,
  projectRoot,
  type WebAssets,
} from "../../packages/web/build/assets.ts";

// The sandbox and runtime assets are @blastlauncher/web's; only client.js is the demo's.
export { depsReady, projectRoot, relativeFiles } from "../../packages/web/build/assets.ts";

export type BrowserAssets = WebAssets & { clientJs: string };
export async function buildBrowserAssets(): Promise<BrowserAssets> {
  const assets = await buildWebAssets();
  const client = await Bun.build({
    entrypoints: [join(projectRoot, "examples/browser-demo/client.ts")],
    target: "browser",
    format: "esm",
    define: { "globalThis.__BLAST_SANDBOX__": "window.__BLAST_SANDBOX__" },
    plugins: [
      {
        name: "demo-deps",
        setup(build) {
          build.onResolve({ filter: /^esbuild-wasm$/ }, () => ({
            path: join(depsModules, "esbuild-wasm/esm/browser.js"),
          }));
        },
      },
    ],
  });
  if (!client.success) throw new Error(client.logs.map((log) => log.message).join("\n"));
  return { ...assets, clientJs: await client.outputs[0]!.text() };
}
