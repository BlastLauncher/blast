import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { buildSite, cnameForOrigin, extractStats, parseOrigin, parseSandboxUrl } from "./site.ts";

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
    await expect(readFile(`${result.www}/demo/demo.css`, "utf8")).resolves.toContain(".root-icon");
    const sandbox = await readFile(`${result.sandbox}/index.html`, "utf8");
    expect(sandbox).toContain("./almostnode-full.mjs");
    expect(sandbox).not.toMatch(/(?:src|href)=["']\//);
  }, 60_000);
});
