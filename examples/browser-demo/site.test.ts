import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { rootModel, rootSections, validateCatalog } from "./root.ts";
import {
  buildSite,
  cnameForOrigin,
  extractStats,
  landing,
  parseOrigin,
  parseSandboxUrl,
  showcaseDirectory,
  siteCatalog,
} from "./site.ts";
import { demoPage } from "./template.ts";

const showcaseCommands = [
  "list",
  "detail",
  "form",
  "grid",
  "actions",
  "feedback",
  "storage",
  "menu",
];

/** Every tab shows the engine-owned flow, copied from the client it names. */
function expectLandingSnippets(html: string) {
  // Bun escapes non-ASCII inside String.raw; the page must show →, ← and … as characters.
  expect(html).not.toMatch(/\\u[0-9a-f]{4}/i);
  expect(html).toContain('<span class="t-in">→ {"type":"hello"');
  for (const panel of ["js", "web", "go", "py", "swift", "ndjson"])
    expect(html).toContain(`id="panel-${panel}"`);
  // JavaScript: the in-process root view.
  expect(html).toContain("createEngine");
  expect(html).toContain('engine.root({ views: { platform: "macOS" } })');
  // Web page: one mount() from @blastlauncher/web.
  expect(html).toContain('import { mount } from "/blast/blast-web.js"');
  expect(html).toContain("sandboxUrl");
  // Go, Python, Swift and NDJSON: hello with views, then the root.
  expect(html).toContain("client.OpenRoot()");
  expect(html).toContain("Client from examples/go-embedder");
  expect(html).toContain('client.request("root.open", {})');
  expect(html).toContain("Standard library only, from examples/python-embedder");
  expect(html).toContain("blast.openRoot(views: .macOS)");
  expect(html).toContain("BlastKit from examples/macos-launcher");
  expect(html).toContain('"views":{"platform":"macOS"}');
  expect(html).toContain('"method":"root.open"');
  expect(html).toContain('"event":"root.launched"');
  // Pre-M9 APIs are gone.
  for (const stale of [
    "launchExtension",
    "WaitView",
    "client.Launch(",
    '"method":"extension.launch"',
  ])
    expect(html).not.toContain(stale);
  expect(html).not.toContain('"type":"init"');
  expect(html).not.toContain("new Engine");
  // Install: the published packages from npm `next`, nothing from source.
  expect(html).toContain("npm install @blastlauncher/engine@next");
  expect(html).toContain("npx -p @blastlauncher/serve@next blast-serve");
  expect(html).toContain("npm install @blastlauncher/web@next");
  expect(html).toContain("<code>3.0.0-alpha.3</code>");
  for (const stale of ["alpha.1", "alpha.2", "From Source", "release:build"])
    expect(html).not.toContain(stale);
  // Release pill links to the tmux plugin.
  expect(html).toContain('<a class="pill" href="https://github.com/BlastLauncher/tmux-blast">');
  expect(html).toContain("The tmux palette is out");
  // Docs and quickstart live on the site now, not on GitHub blob URLs.
  expect(html).not.toContain("blob/main/docs/quickstart.md");
  // Hero switch and embedded live Browser demo / lazy Terminal player.
  expect(html).toContain('id="sw-web"');
  expect(html).toContain('id="sw-tui"');
  expect(html).toContain('aria-controls="view-web"');
  expect(html).toContain('aria-controls="view-tui"');
  expect(html).toContain("/demo/?embed=1");
  expect(html).toContain("Open full screen ↗");
  expect(html).toContain('id="tui-player" data-cast="/tui.cast"');
  expect(html).toContain('import("/tui-player.js")');
  expect(html).toContain("mountTuiPlayer");
  expect(html).toContain("Recording unavailable");
  expect(html).not.toContain("Ctrl+Space opens blast-tui");
  // Reduced-motion media query disables CSS animations cleanly.
  expect(html).toMatch(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*animation:\s*none/,
  );
  // Pure self-contained page: only same-origin demo iframe src=, no @import, and only /fonts/*.woff2 in url().
  const srcs = [...html.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]!);
  for (const target of srcs) expect(target).toMatch(/^(?:https?:\/\/[^/]+)?\/demo\/\?embed=1$/);
  expect(html).not.toMatch(/@import/i);
  const urls = [...html.matchAll(/\burl\(\s*([^)]+?)\s*\)/gi)].map((match) =>
    match[1]!.replace(/^["']|["']$/g, ""),
  );
  expect(urls.length).toBeGreaterThan(0);
  for (const target of urls) expect(target).toMatch(/^\/fonts\/[^/]+\.woff2$/);
  const preloads = [...html.matchAll(/<link\b[^>]*rel=["']preload["'][^>]*>/gi)].map((m) => m[0]);
  expect(preloads).toHaveLength(1);
  expect(preloads[0]).toContain('href="/fonts/geist-latin-wght-normal.woff2"');
}

describe("site build helpers", () => {
  test("validates origins and rejects paths", () => {
    expect(parseOrigin("https://example.com/").origin).toBe("https://example.com");
    expect(() => parseOrigin("ftp://example.com")).toThrow();
    expect(() => parseOrigin("https://example.com/demo")).toThrow();
    expect(parseSandboxUrl("https://example.com/blast-sandbox/").pathname).toBe("/blast-sandbox/");
    expect(() => parseSandboxUrl("https://example.com/blast-sandbox")).toThrow();
  });
  test("only custom domains get CNAME files", () => {
    expect(cnameForOrigin("http://127.0.0.1:4173")).toBeUndefined();
    expect(cnameForOrigin("https://blastlauncher.github.io/")).toBeUndefined();
    expect(cnameForOrigin("https://blast.example.com/")).toBe("blast.example.com");
  });
  test("demoPage omits .demo-bar in embed mode and keeps it by default", () => {
    const standard = demoPage("https://example.com/sandbox/", "./", false, "https://example.com/");
    expect(standard).toContain('class="demo-bar"');
    expect(standard).toContain('class="demo-home"');
    expect(standard).toContain('"embed")==="1"');

    const embedded = demoPage(
      "https://example.com/sandbox/",
      "./",
      false,
      "https://example.com/",
      true,
    );
    expect(embedded).not.toContain("demo-bar");
    expect(embedded).toContain('data-embed="1"');
    expect(embedded).toContain('<div id="app"></div>');
    expect(embedded).toContain("https://example.com/sandbox/");
  });
  test("extracts generated coverage and sweep numbers", () => {
    const stats = extractStats(
      "**Non-deprecated coverage: 12/15 covered (80.0%), 2 partial, 1 missing.**",
      "Corpus commit `x`; seed `y`; 42 selected extensions and 90 commands (90 command records).\n- rendered: 77 command(s)",
    );
    expect(stats).toEqual({
      coverage: { covered: 12, total: 15, percent: "80.0%" },
      rendered: 77,
      commands: 90,
    });
  });
  test("landing page renders hero, 6 code tabs, receipts, and demo link", () => {
    const stats = {
      coverage: { covered: 180, total: 200, percent: "90.0%" },
      rendered: 1250,
      commands: 1500,
    };
    const html = landing(stats, "http://127.0.0.1:4173");
    expect(html).toContain("Raycast extensions, inside your app.");
    expect(html).toContain('href="http://127.0.0.1:4173/demo/"');
    expect(html).toContain('<iframe src="http://127.0.0.1:4173/demo/?embed=1"');
    expect(html).toContain('href="http://127.0.0.1:4173/docs/"');
    expect(html).toContain('href="http://127.0.0.1:4173/docs/quickstart/"');
    for (const label of ["NDJSON", "JavaScript", "Web page", "Go", "Python", "Swift"])
      expect(html).toMatch(new RegExp(`<button[^>]*role="tab"[^>]*>${label}</button>`));
    expectLandingSnippets(html);
    expect(html).toContain("90.0%");
    expect(html).toContain("1,250");
    expect(html).toContain("1,500");
  });
  test("the production catalog opens with the Showcase section, in manifest order", async () => {
    const catalog = validateCatalog(await siteCatalog());
    // A production build carries no test fixtures.
    expect(catalog.extensions.some((extension) => extension.name === "hello-list")).toBe(false);
    const sections = rootSections(rootModel(catalog, "", 0).rows, []);
    expect(sections.map((section) => section.title)).toEqual([
      "Showcase",
      "Suggestions",
      "Commands",
    ]);
    const showcase = sections[0]!.rows;
    expect(showcase.map((row) => row.command)).toEqual(showcaseCommands);
    expect(showcase.every((row) => row.subtitle && row.subtitle !== "Blast Showcase")).toBe(true);
    expect(showcase.find((row) => row.command === "menu")?.accessory).toBe("Menu Bar");
    expect(new Set(showcase.map((row) => row.githubUrl))).toEqual(
      new Set(["https://github.com/blastlauncher/blast/tree/main/examples/browser-demo/showcase"]),
    );
    // Showcase rows are not repeated in later sections, even once recently used.
    const used = rootSections(rootModel(catalog, "", 0).rows, ["blast-showcase:form"]);
    expect(used.map((section) => section.title)).toEqual(["Showcase", "Suggestions", "Commands"]);
    const ids = used.flatMap((section) => section.rows.map((row) => row.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("the showcase manifest matches its sources", async () => {
    const manifest = JSON.parse(await readFile(`${showcaseDirectory}/package.json`, "utf8")) as {
      license: string;
      commands: Array<{ name: string }>;
    };
    expect(manifest.license).toBe("MIT");
    expect(manifest.commands.map((command) => command.name)).toEqual(showcaseCommands);
    for (const command of showcaseCommands)
      await expect(readFile(`${showcaseDirectory}/src/${command}.tsx`, "utf8")).resolves.toContain(
        '"@raycast/api"',
      );
  });
  // Runs a full buildSite (client, almostnode, runtime bundles): seconds on a busy CI runner.
  test("writes one build id and relative sandbox asset references", async () => {
    const result = await buildSite({
      siteOrigin: "http://127.0.0.1:4173",
      sandboxUrl: "https://blastlauncher.github.io/blast-sandbox/",
      buildSha: "test-sha",
      fixtures: true,
    });
    const [wwwBuild, sandboxBuild] = await Promise.all([
      readFile(`${result.www}/build.json`, "utf8"),
      readFile(`${result.sandbox}/build.json`, "utf8"),
    ]);
    expect(JSON.parse(wwwBuild)).toEqual({ sha: "test-sha" });
    expect(JSON.parse(sandboxBuild)).toEqual({ sha: "test-sha" });
    const demo = await readFile(`${result.www}/demo/index.html`, "utf8");
    expect(demo).toContain("https://blastlauncher.github.io/blast-sandbox/");
    expect(demo).toContain('href="./demo.css"');
    // The demo says what it is and links home; home links back to the demo.
    expect(demo).toContain('<a class="demo-home" href="http://127.0.0.1:4173/">');
    expect(demo).toContain("Browser demo · alpha");
    const landingHtml = await readFile(`${result.www}/index.html`, "utf8");
    expect(landingHtml).toContain('href="http://127.0.0.1:4173/demo/"');
    expect(landingHtml).toContain("Raycast extensions, inside your app.");
    expectLandingSnippets(landingHtml);
    expect(landingHtml).toContain(`${result.stats.coverage.percent}`);
    expect(landingHtml).toContain(`${result.stats.rendered.toLocaleString()}`);
    await expect(readFile(`${result.www}/fonts/OFL.txt`, "utf8")).resolves.toContain(
      "SIL OPEN FONT LICENSE",
    );
    await expect(
      readFile(`${result.www}/fonts/geist-latin-wght-normal.woff2`),
    ).resolves.toBeDefined();
    await expect(
      readFile(`${result.www}/fonts/geist-mono-latin-wght-normal.woff2`),
    ).resolves.toBeDefined();
    const fontFiles = (await readdir(`${result.www}/fonts`)).filter((f) => f.endsWith(".woff2"));
    expect(fontFiles.length).toBe(2);
    const fontSizes = await Promise.all(
      fontFiles.map(async (f) => (await stat(`${result.www}/fonts/${f}`)).size),
    );
    const totalFontBytes = fontSizes.reduce((sum, n) => sum + n, 0);
    expect(totalFontBytes).toBeGreaterThan(0);
    expect(totalFontBytes).toBeLessThan(200 * 1024);
    await expect(readFile(`${result.www}/demo/demo.css`, "utf8")).resolves.toContain(".root-icon");
    // The showcase ships prebuilt with every build, fixtures or not.
    const bundles = JSON.parse(await readFile(`${result.www}/demo/bundles.json`, "utf8")) as {
      bundles: Record<string, unknown>;
    };
    for (const command of showcaseCommands)
      expect(Object.keys(bundles.bundles)).toContain(`blast-showcase/${command}`);
    const sandbox = await readFile(`${result.sandbox}/index.html`, "utf8");
    expect(sandbox).toContain("./almostnode-full.mjs");
    expect(sandbox).not.toMatch(/(?:src|href)=["']\//);
  }, 60_000);
});
