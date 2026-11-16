import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "./build.ts";
import {
  docChapters,
  headingSlugger,
  loadDocs,
  renderChapter,
  renderDocs,
  repoUrl,
  rewriteHref,
  writeDocs,
  type DocsInput,
} from "./docs-site.ts";

const slugs = docChapters.map((chapter) => chapter.slug);
const docs = renderDocs(await loadDocs());
const pages = [...docs].filter(([path]) => path.endsWith(".html"));
/** Pages buildSite writes outside docs/ that the docs header links to. */
const otherSitePages = new Set(["/", "/demo/"]);

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!);
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!));
const sidebarOf = (html: string) => html.match(/<nav class="sidebar"[^>]*>([\s\S]*?)<\/nav>/)![1]!;

/** Sources for every chapter, each a bare title unless overridden. */
function fixture(overrides: Record<string, string> = {}): DocsInput {
  const sources: Record<string, string> = {};
  for (const slug of slugs) sources[slug] = overrides[slug] ?? `# ${slug}\n`;
  return { sources, pathKind: (path) => (path === "packages/web" ? "directory" : undefined) };
}

describe("docs site", () => {
  test("writes an index, every chapter, and the stylesheet", () => {
    expect([...docs.keys()].sort()).toEqual(
      [
        "docs/docs.css",
        "docs/index.html",
        ...slugs.map((slug) => `docs/${slug}/index.html`),
      ].sort(),
    );
  });

  test("every chapter's title is its first # heading, shown as the h1", async () => {
    for (const slug of slugs) {
      const markdown = await readFile(join(projectRoot, "docs", `${slug}.md`), "utf8");
      const title = markdown.match(/^# (.+)$/m)![1]!.replace(/`/g, "");
      const html = docs.get(`docs/${slug}/index.html`)!;
      const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
      expect(h1s.length).toBe(1);
      expect(textOf(h1s[0]![1]!)).toBe(title);
      expect(html).toContain(`<title>${title.replace(/'/g, "&#39;")} — Blast docs</title>`);
      expect(html).toContain(`<a href="${repoUrl}/blob/main/docs/${slug}.md">Edit on GitHub</a>`);
    }
    expect(docs.get("docs/index.html")).toContain("<h1");
  });

  test("the sidebar lists all chapters in order and marks exactly the current page", () => {
    for (const [path, html] of pages) {
      const sidebar = sidebarOf(html);
      const chapterLinks = hrefs(sidebar).filter((href) => href !== "/docs/");
      expect(chapterLinks).toEqual(slugs.map((slug) => `/docs/${slug}/`));
      const current = [...sidebar.matchAll(/<a href="([^"]*)" aria-current="page">/g)];
      expect(current.length).toBe(1);
      expect(html.split('aria-current="page"').length).toBe(2);
      expect(`docs${current[0]![1]!.slice("/docs".length)}index.html`).toBe(path);
    }
  });

  test("lists the ## headings under On this page", () => {
    const html = docs.get("docs/quickstart/index.html")!;
    const toc = html.match(/<aside class="toc"[\s\S]*?<\/aside>/)![0];
    const article = html.match(/<article>[\s\S]*<\/article>/)![0];
    const h2s = [...article.matchAll(/<h2 id="([^"]*)">/g)].map((match) => `#${match[1]}`);
    expect(h2s.length).toBeGreaterThan(1);
    expect(hrefs(toc)).toEqual(h2s);
  });

  test("no rendered link points at a .md file except GitHub blob/main URLs", () => {
    for (const [, html] of pages)
      for (const href of hrefs(html))
        if (/\.md(#.*)?$/.test(href)) expect(href.startsWith(`${repoUrl}/blob/main/`)).toBe(true);
  });

  test("every same-site link and anchor resolves to a written page and heading", () => {
    let checked = 0;
    for (const [path, html] of pages) {
      const pageUrl = `/${path.replace(/index\.html$/, "")}`;
      for (const href of hrefs(html)) {
        if (/^[a-z]+:/i.test(href)) continue;
        const url = new URL(href, `http://site${pageUrl}`);
        const target = url.pathname;
        checked++;
        if (otherSitePages.has(target)) continue;
        const file = target.endsWith("/") ? `${target.slice(1)}index.html` : target.slice(1);
        expect({ href, from: path, written: docs.has(file) }).toEqual({
          href,
          from: path,
          written: true,
        });
        if (url.hash)
          expect({ href, from: path, found: ids(docs.get(file)!).has(url.hash.slice(1)) }).toEqual({
            href,
            from: path,
            found: true,
          });
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  test("a relative link to a missing file fails the build with the file names", () => {
    const input = fixture({ embedding: "# Embedding\n\nSee [the guide](../examples/nope.md).\n" });
    expect(() => renderDocs(input)).toThrow(/docs\/embedding\.md.*\.\.\/examples\/nope\.md/);
    expect(() => renderDocs(fixture({ cli: "# CLI\n\n[up](../../outside.md)\n" }))).toThrow(
      /docs\/cli\.md.*outside the repository/,
    );
  });

  test("rewrites chapter, repository and absolute links", () => {
    const kind: DocsInput["pathKind"] = (path) =>
      ({ "examples/go-embedder": "directory", "packages/web/README.md": "file" })[path] as
        | "file"
        | "directory"
        | undefined;
    const from = "docs/quickstart.md";
    expect(rewriteHref("embedding.md", from, kind)).toBe("/docs/embedding/");
    expect(rewriteHref("./root-view.md#keys", from, kind)).toBe("/docs/root-view/#keys");
    expect(rewriteHref("#try-it", from, kind)).toBe("#try-it");
    expect(rewriteHref("../examples/go-embedder/", from, kind)).toBe(
      `${repoUrl}/tree/main/examples/go-embedder`,
    );
    expect(rewriteHref("../packages/web/README.md", from, kind)).toBe(
      `${repoUrl}/blob/main/packages/web/README.md`,
    );
    expect(rewriteHref("https://example.com/a.md", from, kind)).toBe("https://example.com/a.md");
    expect(rewriteHref("mailto:a@example.com", from, kind)).toBe("mailto:a@example.com");
  });

  test("escapes fenced code and inline HTML other than kbd", () => {
    const { body } = renderChapter(
      "quickstart",
      "# Q\n\n```html\n<script>alert(1)</script>\n```\n\nPress <kbd>Esc</kbd> to run <command>.\n",
      () => undefined,
    );
    expect(body).toContain(
      '<pre><code class="language-html">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
    );
    expect(body).not.toContain("<script");
    expect(body).toContain("<kbd>Esc</kbd>");
    expect(body).toContain("&lt;command&gt;");
  });

  test("renders tables, nested lists, emphasis and inline code", () => {
    const { body } = renderChapter(
      "quickstart",
      "# Q\n\n| A | B |\n| - | - |\n| `x` | *y* |\n\n- one\n  - two\n",
      () => undefined,
    );
    expect(body).toContain('<div class="table-wrap"><table>');
    expect(body).toContain("<td><code>x</code></td>");
    expect(body).toContain("<em>y</em>");
    expect(body).toMatch(/<li>one\s*<ul>\s*<li>two<\/li>/);
  });

  test("heading ids follow GitHub's slug rules", () => {
    const slug = headingSlugger();
    expect(slug("blast debug CLI")).toBe("blast-debug-cli");
    expect(slug("Raycast parity checklist (0104)")).toBe("raycast-parity-checklist-0104");
    expect(slug("Embed in JS/TS")).toBe("embed-in-jsts");
    expect(slug("Options")).toBe("options");
    expect(slug("Options")).toBe("options-1");
    expect(slug("Options")).toBe("options-2");
  });

  test("a chapter without a # title fails", () => {
    expect(() => renderDocs(fixture({ tui: "## Only a section\n" }))).toThrow(/docs\/tui\.md/);
  });

  test("writeDocs writes the rendered files under www", async () => {
    const www = await mkdtemp(join(tmpdir(), "blast-docs-"));
    try {
      const written = await writeDocs(www);
      expect(written.sort()).toEqual([...docs.keys()].sort());
      expect(await readFile(join(www, "docs/cli/index.html"), "utf8")).toBe(
        docs.get("docs/cli/index.html")!,
      );
    } finally {
      await rm(www, { recursive: true, force: true });
    }
  });

  test("the stylesheet needs no network and adapts to dark mode", () => {
    const css = docs.get("docs/docs.css")!;
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).not.toMatch(/url\(|@import|https?:/);
    for (const [, html] of pages) {
      expect(html).not.toContain("<script");
      expect(html).not.toMatch(/(src|href)="https?:\/\/(?!github\.com)[^"]*\.(css|js|woff2?)"/);
    }
  });
});
