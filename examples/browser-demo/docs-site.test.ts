import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
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

/** Repo paths that exist, for the link rewriting test. */
const kind: DocsInput["pathKind"] = (path) =>
  ({ "examples/go-embedder": "directory", "packages/web/README.md": "file" })[path] as
    | "file"
    | "directory"
    | undefined;

/** Sources for every chapter, each a bare title unless overridden. */
function fixture(overrides: Record<string, string> = {}): DocsInput {
  const sources: Record<string, string> = {};
  for (const slug of slugs) sources[slug] = overrides[slug] ?? `# ${slug}\n`;
  return { sources, pathKind: (path) => (path === "packages/web" ? "directory" : undefined) };
}

describe("docs site", () => {
  test("writes an index, every chapter, and the stylesheet", () => {
    expect([...docs.keys()].toSorted()).toEqual(
      [
        "docs/docs.css",
        "docs/index.html",
        ...slugs.map((slug) => `docs/${slug}/index.html`),
      ].toSorted(),
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

  test("the Alfred chapter sits after tui and the overview names both sources", () => {
    expect(slugs.indexOf("alfred")).toBe(slugs.indexOf("tui") + 1);
    expect(slugs.indexOf("architecture")).toBe(slugs.indexOf("alfred") + 1);
    const index = docs.get("docs/index.html")!;
    expect(index).toContain("Blast runs unmodified Raycast extensions and Alfred workflows");
    expect(index).toContain('href="/docs/alfred/"');
    const alfred = docs.get("docs/alfred/index.html")!;
    expect(alfred).toContain('href="https://github.com/BlastLauncher/blast/issues/139"');
    // Chapter links inside alfred.md resolve to sibling pages, not GitHub blobs.
    expect(alfred).toContain('href="/docs/embedding/"');
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
        if (target.startsWith("/fonts/")) {
          const fontFile = join(projectRoot, "examples/browser-demo", target.slice(1));
          expect({ href, from: path, exists: existsSync(fontFile) }).toEqual({
            href,
            from: path,
            exists: true,
          });
          continue;
        }
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
    const codeHtml = body.match(/<pre><code class="language-html">([\s\S]*?)<\/code><\/pre>/)?.[1];
    expect(codeHtml).toBeDefined();
    expect(codeHtml!).toContain('<span style="color:#');
    expect(textOf(codeHtml!)).toBe("<script>alert(1)</script>");
    expect(body).not.toContain("<script");
    expect(body).toContain("<kbd>Esc</kbd>");
    expect(body).toContain("&lt;command&gt;");
  });

  test("a docs fixture highlights ts and sh fences and leaves unlabeled fences as escaped plain text", () => {
    const tsCode = 'import { createEngine } from "@blastlauncher/engine";\nconst n: number = 1;';
    const shCode = "npm install @blastlauncher/engine@next";
    const plainCode = "client -> host -> <script>alert(1)</script>";
    const rendered = renderDocs(
      fixture({
        embedding: `# Embedding\n\n\`\`\`ts\n${tsCode}\n\`\`\`\n\n\`\`\`sh\n${shCode}\n\`\`\`\n\n\`\`\`\n${plainCode}\n\`\`\`\n`,
      }),
    );
    const html = rendered.get("docs/embedding/index.html")!;
    const article = html.match(/<article>([\s\S]*?)<\/article>/)![1]!;
    expect(article).not.toContain("<script");

    const tsBlock = article.match(/<pre><code class="language-ts">([\s\S]*?)<\/code><\/pre>/)?.[1];
    expect(tsBlock).toBeDefined();
    expect(tsBlock!).toContain('<span style="color:#');
    expect(textOf(tsBlock!)).toBe(tsCode);

    const shBlock = article.match(/<pre><code class="language-sh">([\s\S]*?)<\/code><\/pre>/)?.[1];
    expect(shBlock).toBeDefined();
    expect(shBlock!).toContain('<span style="color:#');
    expect(textOf(shBlock!)).toBe(shCode);

    const unlabeled = article.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
    expect(unlabeled).toBeDefined();
    expect(unlabeled!).not.toContain("<span");
    expect(textOf(unlabeled!)).toBe(plainCode);
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
      expect(written.toSorted()).toEqual([...docs.keys()].toSorted());
      expect(await readFile(join(www, "docs/cli/index.html"), "utf8")).toBe(
        docs.get("docs/cli/index.html")!,
      );
    } finally {
      await rm(www, { recursive: true, force: true });
    }
  });

  test("docs pages link local Geist fonts, carry the landing header nav, and adapt to dark mode", () => {
    const css = docs.get("docs/docs.css")!;
    expect(css).toMatch(/prefers-color-scheme:\s*dark/);
    expect(css).not.toMatch(/@import|https?:/);
    const cssUrls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) =>
      match[1]!.replace(/^["']|["']$/g, ""),
    );
    expect(cssUrls.length).toBeGreaterThan(0);
    for (const url of cssUrls) expect(url).toMatch(/^\/fonts\/[^/]+\.woff2$/);
    expect(cssUrls).toContain("/fonts/geist-latin-wght-normal.woff2");
    expect(cssUrls).toContain("/fonts/geist-mono-latin-wght-normal.woff2");

    for (const [, html] of pages) {
      expect(html).toContain('href="/fonts/geist-latin-wght-normal.woff2"');
      expect(html).toContain('<span class="mark" aria-hidden="true"></span>Blast</a>');
      expect(html).toContain('<nav aria-label="Main">');
      expect(html).toContain('<a href="/docs/">Docs</a>');
      expect(html).toContain('<a href="/demo/" class="opt">Demo</a>');
      expect(html).toContain("Coverage</a>");
      expect(html).toContain(`<a href="${repoUrl}">GitHub</a>`);
      expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
      expect(html).not.toMatch(/(src|href)="https?:\/\/(?!github\.com)[^"]*\.(css|js|woff2?)"/);
    }
  });
});
