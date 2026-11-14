// Explicit network-enabled check after `release:build`; never imported by bun test.
// Installs the @blastlauncher/web tarball like an embedder would, serves its
// assets/ and sandbox/ directories as-is on two loopback origins, and renders
// hello-list from a page whose only setup is one mount() call.
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, normalize } from "node:path";
import { depsModules, depsReady, relativeFiles } from "../../packages/web/build/assets.ts";
import { output, root, run } from "./build.ts";

const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(root, ".cache", "ms-playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
if (!existsSync(browsers)) throw new Error(`PLAYWRIGHT_BROWSERS_PATH is missing: ${browsers}`);

const tarballs = (await readdir(join(output, "tarballs")).catch(() => [])).filter((file) =>
  /^blastlauncher-(web|client-core|protocol)-.+\.tgz$/.test(file),
);
if (tarballs.length !== 3) throw new Error("Run release:build first");
const project = join(output, "web-e2e");
await rm(project, { recursive: true, force: true });
await mkdir(project, { recursive: true });
run("npm", ["init", "-y"], project);
run(
  "npm",
  ["install", "--no-audit", "--no-fund", ...tarballs.map((file) => join(output, "tarballs", file))],
  project,
);
await depsReady();
const web = join(project, "node_modules/@blastlauncher/web");

/** Serves `directory` unchanged, like any static host would. */
const serveStatic = (directory: string, path: string) => {
  const file = normalize(join(directory, path.endsWith("/") ? `${path}index.html` : path));
  return file.startsWith(directory) && existsSync(file)
    ? new Response(Bun.file(file))
    : new Response("Not found", { status: 404 });
};
const sandbox = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => serveStatic(join(web, "sandbox"), new URL(request.url).pathname),
});
// The whole embedding page; `fixtures` only swaps GitHub for the repo's hello-list.
const page = `<!doctype html>
<meta charset="utf-8" />
<div id="app"></div>
<script type="module">
  import { mount } from "/blast/blast-web.js";
  mount(document.querySelector("#app"), {
    extension: "raycast/extensions/hello-list",
    sandboxUrl: "http://127.0.0.1:${sandbox.port}/",
    fixtures: true,
  });
</script>
`;
const fixture = join(root, "fixtures/extensions/hello-list");
const host = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path === "/") return new Response(page, { headers: { "content-type": "text/html" } });
    if (path === "/blast/fixtures/hello-list/__files")
      return Response.json(await relativeFiles(fixture));
    if (path.startsWith("/blast/fixtures/hello-list/"))
      return serveStatic(fixture, path.slice("/blast/fixtures/hello-list".length));
    if (path.startsWith("/blast/")) return serveStatic(join(web, "assets"), path.slice(6));
    return new Response("Not found", { status: 404 });
  },
});

try {
  const { chromium } = (await import(
    join(depsModules, "playwright/index.mjs")
  )) as typeof import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const tab = await browser.newPage();
    tab.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    await tab.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: "load" });
    await tab.locator("#app li[data-id]:has-text('apple')").waitFor({ timeout: 120_000 });
    if ((await tab.locator(`iframe[src^="http://127.0.0.1:${sandbox.port}/"]`).count()) === 0)
      throw new Error("the extension did not run in the sandbox origin");
    console.log(
      JSON.stringify({ pass: true, row: "apple", pageLines: page.trim().split("\n").length }),
    );
  } finally {
    await browser.close();
  }
} finally {
  host.stop();
  sandbox.stop();
  await rm(join(project, "node_modules"), { recursive: true, force: true });
}
