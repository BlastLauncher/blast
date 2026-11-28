import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { alfredExecutionCoverage, landingSnippets, releaseVersion } from "./landing.ts";
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
import { slopPage } from "./slop.ts";
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

function stripTagsAndUnescape(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function panelCodeHtml(html: string, id: keyof typeof landingSnippets): string {
  const match = html.match(
    new RegExp(
      `<div class="tab-panel" id="panel-${id}"[^>]*>\\s*<pre><code>([\\s\\S]*?)</code></pre>`,
    ),
  );
  if (!match) throw new Error(`Missing code panel ${id}`);
  return match[1]!;
}

/** Every tab shows the engine-owned flow, copied from the client it names. */
function expectLandingSnippets(html: string) {
  // Bun escapes non-ASCII inside String.raw; the page must show →, ← and … as characters.
  expect(html).not.toMatch(/\\u[0-9a-f]{4}/i);
  for (const panel of ["js", "web", "go", "py", "swift", "ndjson"] as const) {
    expect(html).toContain(`id="panel-${panel}"`);
    const codeHtml = panelCodeHtml(html, panel);
    expect(codeHtml).toContain('<span style="color:#');
    expect(stripTagsAndUnescape(codeHtml)).toBe(landingSnippets[panel]);
  }
  const ndjsonPanel = panelCodeHtml(html, "ndjson");
  expect(ndjsonPanel).toContain('<span class="t-in">→</span>');
  expect(ndjsonPanel).toContain('<span class="t-out">←</span>');

  const text = stripTagsAndUnescape(html);
  // JavaScript: the in-process root view.
  expect(text).toContain("createEngine");
  expect(text).toContain('engine.root({ views: { platform: "macOS" } })');
  // Web page: one mount() from @blastlauncher/web.
  expect(text).toContain('import { mount } from "/blast/blast-web.js"');
  expect(text).toContain("sandboxUrl");
  // Go, Python, Swift and NDJSON: hello with views, then the root.
  expect(text).toContain("client.OpenRoot()");
  expect(text).toContain("Client from examples/go-embedder");
  expect(text).toContain('client.request("root.open", {})');
  expect(text).toContain("Standard library only, from examples/python-embedder");
  expect(text).toContain("blast.openRoot(views: .macOS)");
  expect(text).toContain("BlastKit from examples/macos-launcher");
  expect(text).toContain('"views":{"platform":"macOS"}');
  expect(text).toContain('"method":"root.open"');
  expect(text).toContain('"event":"root.launched"');
  // Pre-M9 APIs are gone.
  for (const stale of [
    "launchExtension",
    "WaitView",
    "client.Launch(",
    '"method":"extension.launch"',
  ])
    expect(text).not.toContain(stale);
  expect(text).not.toContain('"type":"init"');
  expect(text).not.toContain("new Engine");
  // Install: plain package names (`latest`), no `@next` in install commands, and current release version.
  const instBlock = html.match(/<div class="inst">([\s\S]*?)<\/div>\s*<p class="inst-note">/)?.[1];
  expect(instBlock).toBeDefined();
  expect(instBlock).toContain("npm install @blastlauncher/engine");
  expect(instBlock).toContain("npx -p @blastlauncher/serve blast-serve");
  expect(instBlock).toContain("npm install @blastlauncher/web");
  expect(instBlock).not.toContain("@next");
  expect(html).toContain(`<b>${releaseVersion}</b>`);
  expect(html).toContain(`<code>${releaseVersion}</code> is <code>latest</code> on npm`);
  expect(html).toContain("<code>@next</code> is the canary from <code>main</code>");
  expect(html).toContain("session.view.patch");
  // Any other version string on the page is stale.
  for (const version of html.match(/\b\d+\.\d+\.\d+-[a-z]+\.\d+\b/g) ?? [])
    expect(version).toBe(releaseVersion);
  for (const stale of ["From Source", "release:build"]) expect(html).not.toContain(stale);
  // Release pill announces Alfred workflows and links to their docs chapter.
  expect(html).toMatch(/<a class="pill" href="(?:https?:\/\/[^/"]+)?\/docs\/alfred\/">/);
  expect(html).toContain(`<b>${releaseVersion}</b> Alfred workflows now run in Blast →`);
  expect(html).not.toContain("The tmux palette is out");
  // Title, description, hero and first flow card cover both Raycast and Alfred.
  expect(html).toContain(
    "<title>Blast — Raycast extensions &amp; Alfred workflows, inside your app</title>",
  );
  expect(html).toMatch(
    /<meta name="description" content="[^"]*Raycast extensions and Alfred workflows/,
  );
  expect(html).toContain("<h1>Raycast &amp; Alfred, inside your app.</h1>");
  expect(html).toMatch(
    /<p class="lede">[^<]*Raycast extensions and Alfred workflows[^<]*<code>\.alfredworkflow<\/code>/,
  );
  expect(html).toContain(
    '<span class="who">raycast · alfred</span><h3>Extensions &amp; workflows</h3>',
  );
  // Facts are a balanced 2×2 grid ending in Alfred execution coverage.
  expect(html).toMatch(/\.facts \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  const facts = [
    ...(html.match(/<dl class="facts">([\s\S]*?)<\/dl>/)?.[1] ?? "").matchAll(/<dt>([^<]*)<\/dt>/g),
  ];
  expect(facts.map((match) => match[1])).toEqual([
    "@raycast/api",
    "rendered",
    "commands tested",
    "alfred objects",
  ]);
  expect(html).toContain(`<dt>alfred objects</dt><dd>${alfredExecutionCoverage}</dd>`);
  expect(html).toMatch(
    /<p class="inst-note">[\s\S]*?<a href="(?:https?:\/\/[^/"]+)?\/docs\/alfred\/">Alfred workflows<\/a>/,
  );
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
    expect(html).toContain("Raycast &amp; Alfred, inside your app.");
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
  test("slop parody shares the header nav, links back to the real page, and loads nothing external", () => {
    const html = slopPage("http://127.0.0.1:4173");
    expect(html).toContain('<nav aria-label="Main">');
    expect(html).toContain('<a href="http://127.0.0.1:4173/slop/">Slop</a>');
    expect(html).toContain('href="http://127.0.0.1:4173/">Take me to the real site</a>');
    expect(html).toContain("What does Blast actually do?");
    expect(html).not.toMatch(/<(script|img|iframe)\b/i);
    expect(html).not.toMatch(/<link\b[^>]*href="https?:/i);
    expect(html).not.toMatch(/url\(["']?https?:/i);
  });
  test("landing header links to the slop parody", () => {
    const html = landing({
      coverage: { covered: 1, total: 1, percent: "100%" },
      rendered: 1,
      commands: 1,
    });
    expect(html).toContain('<a href="/slop/">Slop</a>');
  });
  test("landing releaseVersion matches README.md and docs/quickstart.md", async () => {
    for (const rel of ["../../README.md", "../../docs/quickstart.md"]) {
      const markdown = await readFile(new URL(rel, import.meta.url), "utf8");
      const match = markdown.match(/`([^`]+)` is `latest` on npm/);
      expect(match?.[1]).toBe(releaseVersion);
    }
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
  test.each([undefined, "https://proxy.example/v1"])(
    "writes sandbox assets and optional proxy %s",
    async (fetchProxy) => {
      const result = await buildSite({
        siteOrigin: "http://127.0.0.1:4173",
        sandboxUrl: "https://blastlauncher.github.io/blast-sandbox/",
        buildSha: "test-sha",
        fetchProxy,
        fixtures: true,
      });
      const [wwwBuild, sandboxBuild] = await Promise.all([
        readFile(`${result.www}/build.json`, "utf8"),
        readFile(`${result.sandbox}/build.json`, "utf8"),
      ]);
      expect(JSON.parse(wwwBuild)).toEqual({ sha: "test-sha" });
      expect(JSON.parse(sandboxBuild)).toEqual({ sha: "test-sha" });
      const slop = await readFile(`${result.www}/slop/index.html`, "utf8");
      expect(slop).toContain("AI-Powered Launcher Synergy");
      const demo = await readFile(`${result.www}/demo/index.html`, "utf8");
      expect(demo).toContain("https://blastlauncher.github.io/blast-sandbox/");
      expect(demo.includes("window.__BLAST_FETCH_PROXY__=")).toBe(Boolean(fetchProxy));
      if (fetchProxy)
        expect(demo).toContain(`window.__BLAST_FETCH_PROXY__=${JSON.stringify(fetchProxy)}`);
      for (const html of [demo, await readFile(`${result.www}/index.html`, "utf8")]) {
        expect(html.includes('<p class="proxy-notice">')).toBe(Boolean(fetchProxy));
        if (fetchProxy) {
          expect(html).toContain('href="/docs/embedding/#network-proxy"');
          expect(html).toContain(
            'href="https://github.com/blastlauncher/blast/tree/main/packages/cors-proxy"',
          );
          expect(html).toContain("nothing is logged or stored");
          expect(html).toContain("Do not enter secret keys, tokens or private data");
        }
      }
      const client = await readFile(`${result.www}/demo/client.js`, "utf8");
      expect(client).toContain("__BLAST_FETCH_PROXY__");
      const source = await readFile(new URL("./client.ts", import.meta.url), "utf8");
      expect(source).toContain("...sandboxOptions,");
      expect(source).toContain("prewarm(sandboxOptions)");
      expect(demo).toContain('href="./demo.css"');
      // The demo says what it is and links home; home links back to the demo.
      expect(demo).toContain('<a class="demo-home" href="http://127.0.0.1:4173/">');
      expect(demo).toContain("Browser demo · alpha");
      const landingHtml = await readFile(`${result.www}/index.html`, "utf8");
      expect(landingHtml).toContain('href="http://127.0.0.1:4173/demo/"');
      expect(landingHtml).toContain("Raycast &amp; Alfred, inside your app.");
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
      await expect(readFile(`${result.www}/demo/demo.css`, "utf8")).resolves.toContain(
        ".root-icon",
      );
      // The showcase ships prebuilt with every build, fixtures or not.
      const bundles = JSON.parse(await readFile(`${result.www}/demo/bundles.json`, "utf8")) as {
        bundles: Record<string, unknown>;
      };
      for (const command of showcaseCommands)
        expect(Object.keys(bundles.bundles)).toContain(`blast-showcase/${command}`);
      const sandbox = await readFile(`${result.sandbox}/index.html`, "utf8");
      expect(sandbox).toContain("./almostnode-full.mjs");
      expect(sandbox).not.toMatch(/(?:src|href)=["']\//);
    },
    60_000,
  );
});
