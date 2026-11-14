import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
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
    for (const label of ["JavaScript", "Web page", "Go", "Python", "Swift", "NDJSON"])
      expect(html).toContain(`role="tab">${label}</label>`);
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
