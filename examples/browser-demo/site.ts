import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildBrowserAssets, projectRoot, relativeFiles } from "./build.ts";
import { prebuildCatalog } from "./prebuild.ts";
import { sandboxPage } from "../../packages/web/sandbox/page.ts";
import { demoPage } from "./template.ts";
import { enrichCatalog, type Catalog, type CatalogExtension, type SweepResult } from "./root.ts";
import { landing } from "./landing.ts";
export { landing };

/** The Blast-authored showcase extension, shipped in every site build. */
export const showcaseDirectory = join(projectRoot, "examples/browser-demo/showcase");

/** The showcase's catalog entry, read from its manifest so the two cannot drift. */
export async function showcaseExtension(): Promise<CatalogExtension> {
  const manifest = JSON.parse(await readFile(join(showcaseDirectory, "package.json"), "utf8")) as {
    name: string;
    title: string;
    description: string;
    commands: Array<{ name: string; title: string; description: string; mode: string }>;
  };
  return {
    name: manifest.name,
    title: manifest.title,
    description: manifest.description,
    showcase: true,
    commands: manifest.commands.map((command) => ({
      name: command.name,
      title: command.title,
      subtitle: command.description,
      mode: command.mode,
    })),
  };
}

export type SiteOptions = {
  siteOrigin: string;
  sandboxUrl: string;
  buildSha?: string;
  fixtures?: boolean;
};
export type SiteStats = {
  coverage: { covered: number; total: number; percent: string };
  rendered: number;
  commands: number;
};

export function parseOrigin(value: string, label = "origin"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an http(s) origin`);
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(`${label} must be an http(s) origin without a path`);
  return url;
}
export function parseSandboxUrl(value: string, label = "sandbox URL"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an http(s) URL with a path`);
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname === "/" ||
    !url.pathname.endsWith("/") ||
    url.search ||
    url.hash
  )
    throw new Error(`${label} must be an http(s) URL with a trailing-slash path`);
  return url;
}
export function cnameForOrigin(value: string): string | undefined {
  const url = parseOrigin(value);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".github.io"))
    return undefined;
  return url.hostname;
}
export function extractStats(coverage: string, sweep: string): SiteStats {
  const match =
    coverage.match(
      /Non-deprecated coverage is not reported here|Non-deprecated coverage[^\n]*?(\d+)\/(\d+) covered/i,
    ) ?? coverage.match(/\*\*Non-deprecated coverage:\s*(\d+)\/(\d+)/i);
  const covered = Number(match?.[1] ?? 0),
    total = Number(match?.[2] ?? 0);
  const rendered = Number(sweep.match(/rendered:\s*(\d+) command/i)?.[1] ?? 0);
  const commands = Number(
    sweep.match(/and\s*(\d+) commands/i)?.[1] ?? sweep.match(/(\d+) command records/i)?.[1] ?? 0,
  );
  return {
    coverage: {
      covered,
      total,
      percent: total ? `${((covered / total) * 100).toFixed(1)}%` : "0.0%",
    },
    rendered,
    commands,
  };
}

/** The demo catalog: generated corpus entries, the showcase, and (for tests) fixtures. */
export async function siteCatalog(fixtures = false): Promise<Catalog> {
  const catalog = JSON.parse(
    await readFile(join(projectRoot, "examples/browser-demo/catalog.json"), "utf8"),
  ) as Catalog;
  // Keep tab incompatibilities as generated catalog metadata so the launcher
  // can explain them without coupling to extension names.
  try {
    const sweep = JSON.parse(
      await readFile(join(projectRoot, "compat/browser-sweep.json"), "utf8"),
    ) as { results?: SweepResult[] };
    Object.assign(catalog, enrichCatalog(catalog, sweep.results ?? []));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Local development can build from a slim checkout without sweep output.
  }
  catalog.extensions.push(await showcaseExtension());
  if (fixtures) {
    catalog.extensions.push({
      name: "hello-list",
      title: "Hello List",
      commands: [{ name: "index", title: "Hello List", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-storage",
      title: "Browser Storage",
      commands: [{ name: "index", title: "Browser Storage", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-preferences",
      title: "Browser Preferences",
      commands: [{ name: "index", title: "Browser Preferences", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-keyboard",
      title: "Browser Keyboard",
      commands: [{ name: "index", title: "Browser Keyboard", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-form",
      title: "Browser Form",
      commands: [{ name: "index", title: "Browser Form", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-modes",
      title: "Browser Modes",
      commands: [
        { name: "finish", title: "Finish Command", mode: "no-view" },
        { name: "menu", title: "Menu Command", mode: "menu-bar" },
      ],
    });
    for (const [name, title] of [
      ["browser-grid", "Browser Grid"],
      ["browser-feedback", "Browser Feedback"],
      ["browser-fields", "Browser Fields"],
      ["browser-typing", "Browser Typing"],
    ] as const)
      catalog.extensions.push({
        name,
        title,
        commands: [{ name: "index", title, mode: "view" }],
      });
  }
  catalog.extensions.sort((a, b) => a.name.localeCompare(b.name));
  return catalog;
}

export async function buildSite(
  options: SiteOptions,
): Promise<{ www: string; sandbox: string; stats: SiteStats }> {
  const site = parseOrigin(options.siteOrigin, "--site-origin");
  const sandboxUrl = parseSandboxUrl(options.sandboxUrl, "--sandbox-url");
  const buildSha = options.buildSha ?? process.env.GITHUB_SHA ?? "local";
  const stats = extractStats(
    await readFile(join(projectRoot, "compat/COVERAGE.md"), "utf8"),
    await readFile(join(projectRoot, "compat/SWEEP.md"), "utf8"),
  );
  const output = join(projectRoot, ".cache", "site");
  await rm(output, { recursive: true, force: true });
  const www = join(output, "www"),
    sandbox = join(output, "sandbox"),
    demo = join(www, "demo");
  await mkdir(demo, { recursive: true });
  await mkdir(sandbox, { recursive: true });
  const assets = await buildBrowserAssets();
  await writeFile(join(www, "index.html"), landing(stats, site.origin));
  await writeFile(
    join(www, "site.css"),
    ".button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #ff6338;outline-offset:3px}\n",
  );
  await writeFile(
    join(www, "404.html"),
    '<!doctype html><title>Blast — not found</title><p>That page is not here. <a href="/">Go home</a>.</p>\n',
  );
  await writeFile(join(www, ".nojekyll"), "");
  await writeFile(
    join(demo, "index.html"),
    demoPage(sandboxUrl.href, "./", options.fixtures, `${site.origin}/`),
  );
  await cp(join(projectRoot, "examples/browser-demo/demo.css"), join(demo, "demo.css"));
  await writeFile(join(demo, "client.js"), assets.clientJs);
  await writeFile(join(demo, "almostnode.mjs"), assets.almost);
  await writeFile(join(demo, "esbuild.wasm"), assets.wasm);
  await writeFile(join(demo, "blast-sources.json"), JSON.stringify(assets.sources));
  const catalog = await siteCatalog(options.fixtures);
  await writeFile(join(demo, "catalog.json"), `${JSON.stringify(catalog)}\n`);
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/hello-list"),
      join(demo, "fixtures/hello-list"),
      { recursive: true },
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/hello-list/__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions/hello-list"))),
    );
  if (options.fixtures) {
    await cp(
      join(projectRoot, "fixtures/extensions/browser-modes"),
      join(demo, "fixtures/browser-modes"),
      { recursive: true },
    );
    await writeFile(
      join(demo, "fixtures/browser-modes/__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions/browser-modes"))),
    );
  }
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/browser-storage"),
      join(demo, "fixtures/browser-storage"),
      {
        recursive: true,
      },
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/browser-storage/__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions/browser-storage"))),
    );
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/browser-preferences"),
      join(demo, "fixtures/browser-preferences"),
      { recursive: true },
    );
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/browser-keyboard"),
      join(demo, "fixtures/browser-keyboard"),
      { recursive: true },
    );
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/browser-form"),
      join(demo, "fixtures/browser-form"),
      { recursive: true },
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/browser-preferences/__files"),
      JSON.stringify(
        await relativeFiles(join(projectRoot, "fixtures/extensions/browser-preferences")),
      ),
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/browser-keyboard/__files"),
      JSON.stringify(
        await relativeFiles(join(projectRoot, "fixtures/extensions/browser-keyboard")),
      ),
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/browser-form/__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions/browser-form"))),
    );
  for (const fixture of ["browser-grid", "browser-feedback", "browser-fields", "browser-typing"]) {
    if (!options.fixtures) break;
    await cp(join(projectRoot, "fixtures/extensions", fixture), join(demo, "fixtures", fixture), {
      recursive: true,
    });
    await writeFile(
      join(demo, "fixtures", fixture, "__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions", fixture))),
    );
  }
  const showcase = catalog.extensions.find((extension) => extension.showcase);
  await prebuildCatalog(catalog, buildSha, demo, options.fixtures, {
    local: showcase ? { [showcase.name]: showcaseDirectory } : {},
  });
  await writeFile(join(sandbox, "index.html"), sandboxPage("./almostnode-full.mjs"));
  await writeFile(join(sandbox, "almostnode-full.mjs"), assets.sandbox);
  await writeFile(join(www, "build.json"), `${JSON.stringify({ sha: buildSha })}\n`);
  await writeFile(join(sandbox, "build.json"), `${JSON.stringify({ sha: buildSha })}\n`);
  await writeFile(
    join(sandbox, "_headers"),
    "/*\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n",
  );
  await writeFile(join(sandbox, ".nojekyll"), "");
  await writeFile(join(sandbox, "404.html"), "<!doctype html><title>Not found</title>\n");
  const cname = cnameForOrigin(site.origin);
  if (cname) await writeFile(join(www, "CNAME"), `${cname}\n`);
  return { www, sandbox, stats };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const siteOrigin = value("--site-origin") ?? "http://127.0.0.1:4173";
  const sandboxUrl = value("--sandbox-url") ?? "http://127.0.0.1:4174/blast-sandbox/";
  const result = await buildSite({
    siteOrigin,
    sandboxUrl,
    fixtures: args.includes("--fixtures"),
  });
  console.log(`site:build ${result.www} and ${result.sandbox}`);
}
