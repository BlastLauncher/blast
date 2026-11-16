import { readFile, mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { Marked } from "marked";
import { projectRoot } from "./build.ts";
import { escapeHtml, highlightCode } from "./highlight.ts";
import {
  fontFacesCss,
  fontPreloadHtml,
  repoUrl,
  siteHeaderCss,
  siteHeaderHtml,
  themeTokensCss,
} from "./site-chrome.ts";

export { repoUrl };

/** The rendered chapters, in sidebar order; each comes from `docs/<slug>.md`. */
export const docChapters = [
  { slug: "quickstart", summary: "Run an extension in your app in a few minutes." },
  { slug: "embedding", summary: "How an embedder talks to the engine: views, input, requests." },
  { slug: "root-view", summary: "The engine-owned launcher that lists every command." },
  {
    slug: "launch-prompts",
    summary: "Preferences and arguments the engine asks for before a run.",
  },
  { slug: "capabilities", summary: "Privileged host operations and how they are granted." },
  { slug: "cli", summary: "The headless `blast` client for running and driving extensions." },
  { slug: "tui", summary: "The terminal client and its tmux palette." },
  { slug: "architecture", summary: "Packages, process model and data flow as they are today." },
] as const;

export type PathKind = "file" | "directory" | undefined;
export type DocsInput = {
  /** Markdown for every chapter slug. */
  sources: Record<string, string>;
  /** Whether a repo-relative path exists, for checking relative links. */
  pathKind(repoPath: string): PathKind;
};

const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&(lt|gt|quot|#39|amp);/g, (_, name: string) =>
      name === "lt"
        ? "<"
        : name === "gt"
          ? ">"
          : name === "quot"
            ? '"'
            : name === "#39"
              ? "'"
              : "&",
    );
const withoutLinks = (html: string) => html.replace(/<\/?a\b[^>]*>/g, "");

/** GitHub's heading ids (github-slugger), so `file.md#anchor` links keep working here. */
export function headingSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
    let slug = base;
    while (seen.has(slug)) {
      const count = seen.get(base)! + 1;
      seen.set(base, count);
      slug = `${base}-${count}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}

/**
 * Turn a link in `from` (a repo path such as `docs/quickstart.md`) into its
 * site URL: chapters become `/docs/<slug>/`, other repo files point at GitHub,
 * and a relative link to a missing file fails the build.
 */
export function rewriteHref(href: string, from: string, pathKind: DocsInput["pathKind"]): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#"))
    return href;
  const hashAt = href.indexOf("#");
  const path = hashAt < 0 ? href : href.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  const decoded = decodeURI(path.split("?")[0]!);
  const target = posix
    .normalize(
      decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(from), decoded),
    )
    .replace(/\/+$/, "");
  if (target === ".." || target.startsWith("../"))
    throw new Error(`${from}: link ${href} points outside the repository`);
  const chapter = docChapters.find((entry) => target === `docs/${entry.slug}.md`);
  if (chapter) return `/docs/${chapter.slug}/${hash}`;
  const kind = target === "." ? "directory" : pathKind(target);
  if (!kind) throw new Error(`${from}: link ${href} points to ${target}, which does not exist`);
  if (target === ".") return repoUrl;
  return `${repoUrl}/${kind === "directory" ? "tree" : "blob"}/main/${target}${hash}`;
}

type Heading = { depth: number; id: string; html: string };
type RenderedChapter = { title: string; titleHtml: string; body: string; headings: Heading[] };

export function renderChapter(
  slug: string,
  markdown: string,
  pathKind: DocsInput["pathKind"],
): RenderedChapter {
  const from = `docs/${slug}.md`;
  const slugFor = headingSlugger();
  const headings: Heading[] = [];
  let title: { text: string; html: string } | undefined;
  const marked = new Marked({
    gfm: true,
    async: false,
    walkTokens(token) {
      if (token.type === "link") token.href = rewriteHref(token.href, from, pathKind);
    },
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = plainText(inner);
        const id = slugFor(text);
        if (depth === 1 && !title) {
          title = { text, html: inner };
          return `<h1 id="${id}">${inner}</h1>\n`;
        }
        headings.push({ depth, id, html: withoutLinks(inner) });
        return `<h${depth} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to ${escapeHtml(text)}">#</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        const raw = text.replace(/\n$/, "");
        const language = (lang ?? "").match(/^[\w+-]+/)?.[0];
        const attribute = language ? ` class="language-${escapeHtml(language)}"` : "";
        const highlighted = highlightCode(raw, language);
        const head = language
          ? `<div class="code-head"><span class="code-lang">${escapeHtml(language)}</span><button class="code-copy" type="button" aria-label="Copy code">Copy</button></div>`
          : `<div class="code-head code-head-nolang"><button class="code-copy" type="button" aria-label="Copy code">Copy</button></div>`;
        return `<div class="code-block">${head}<pre><code${attribute}>${highlighted}</code></pre></div>\n`;
      },
      // Pass through only the inline HTML the docs use; anything else is shown
      // as text, which is also how GitHub-unknown tags like `<command>` read.
      html({ text }) {
        return /^<\/?kbd>$/i.test(text.trim()) ? text : escapeHtml(text);
      },
    },
  });
  const body = (marked.parse(markdown) as string)
    .replaceAll("<table>", '<div class="table-wrap"><table>')
    .replaceAll("</table>", "</table></div>");
  if (!title) throw new Error(`${from}: no "# " title heading`);
  return { title: title.text, titleHtml: title.html, body, headings };
}

const chapterLink = (href: string, label: string, current: boolean) =>
  `<li><a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a></li>`;

function page(options: {
  title: string;
  chapterTitles: readonly string[];
  current: string;
  article: string;
  headings: Heading[];
  source: string;
}): string {
  const sidebar = [
    chapterLink("/docs/", "Overview", options.current === ""),
    ...docChapters.map((chapter, index) =>
      chapterLink(
        `/docs/${chapter.slug}/`,
        options.chapterTitles[index]!,
        options.current === chapter.slug,
      ),
    ),
  ].join("");
  const toc = options.headings.filter((heading) => heading.depth === 2);
  const tocHtml = toc.length
    ? `<aside class="toc" aria-labelledby="toc-title"><h2 id="toc-title">On this page</h2><ol>${toc
        .map((heading) => `<li><a href="#${heading.id}">${heading.html}</a></li>`)
        .join("")}</ol></aside>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
${fontPreloadHtml}
<link rel="stylesheet" href="/docs/docs.css">
<script>document.documentElement.classList.add("js");</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
${siteHeaderHtml({ homeUrl: "/", docsUrl: "/docs/", demoUrl: "/demo/" })}
<div class="layout">
<nav class="sidebar" aria-label="Chapters"><ol>${sidebar}</ol></nav>
<main id="content">
<article>
${options.article}</article>
<p class="edit"><a href="${options.source}">Edit on GitHub</a></p>
</main>
${tocHtml}
</div>
<script>
document.querySelectorAll(".code-copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const code = btn.closest(".code-block")?.querySelector("code");
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent || "");
      btn.textContent = "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      btn.textContent = "Selected";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  });
});
</script>
</body>
</html>
`;
}

/** Every docs file, keyed by its path under the site root. */
export function renderDocs(input: DocsInput): Map<string, string> {
  const rendered = docChapters.map((chapter) => {
    const markdown = input.sources[chapter.slug];
    if (markdown === undefined) throw new Error(`docs/${chapter.slug}.md is missing`);
    return renderChapter(chapter.slug, markdown, input.pathKind);
  });
  // The sidebar shows each chapter's own `#` title.
  const chapterTitles = rendered.map((chapter) => withoutLinks(chapter.titleHtml));
  const files = new Map<string, string>();
  files.set("docs/docs.css", docsCss);
  const index = docChapters
    .map(
      (chapter, position) =>
        `<li><a href="/docs/${chapter.slug}/">${chapterTitles[position]}</a><p>${escapeHtml(chapter.summary).replace(/`([^`]+)`/g, "<code>$1</code>")}</p></li>`,
    )
    .join("\n");
  files.set(
    "docs/index.html",
    page({
      title: "Blast documentation",
      chapterTitles,
      current: "",
      article: `<h1 id="blast-documentation">Blast documentation</h1>
<p>Blast runs unmodified Raycast extensions inside your app. These chapters are rendered from <a href="${repoUrl}/tree/main/docs">docs/</a> in the repository.</p>
<ol class="chapters">
${index}
</ol>
`,
      headings: [],
      source: `${repoUrl}/blob/main/examples/browser-demo/docs-site.ts`,
    }),
  );
  docChapters.forEach((chapter, position) => {
    const { title, body, headings } = rendered[position]!;
    files.set(
      `docs/${chapter.slug}/index.html`,
      page({
        title: `${title} — Blast docs`,
        chapterTitles,
        current: chapter.slug,
        article: body,
        headings,
        source: `${repoUrl}/blob/main/docs/${chapter.slug}.md`,
      }),
    );
  });
  return files;
}

/** Read the chapters from a checkout and check links against its files. */
export async function loadDocs(root = projectRoot): Promise<DocsInput> {
  const sources: Record<string, string> = {};
  for (const chapter of docChapters)
    sources[chapter.slug] = await readFile(join(root, "docs", `${chapter.slug}.md`), "utf8");
  return {
    sources,
    pathKind(repoPath) {
      const stat = statSync(join(root, repoPath), { throwIfNoEntry: false });
      return stat ? (stat.isDirectory() ? "directory" : "file") : undefined;
    },
  };
}

/** Write `docs/` under `www`; returns the written paths relative to `www`. */
export async function writeDocs(www: string, root = projectRoot): Promise<string[]> {
  const files = renderDocs(await loadDocs(root));
  for (const [path, content] of files) {
    await mkdir(dirname(join(www, path)), { recursive: true });
    await writeFile(join(www, path), content);
  }
  return [...files.keys()];
}

export const docsCss = `${fontFacesCss}
${themeTokensCss}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font: 15px/1.6 var(--sans);
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
code, kbd, pre { font-family: var(--mono); }
.skip {
  position: absolute;
  left: -999px;
  top: .5rem;
  padding: .5rem .75rem;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  text-decoration: none;
  z-index: 10;
}
.skip:focus { left: .5rem; }
header { background: var(--surface); border-bottom: 1px solid var(--line); }
${siteHeaderCss}
.layout {
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr) 13.5rem;
  grid-template-areas: "side main toc";
  gap: 2.5rem;
  max-width: 1160px;
  margin: 0 auto;
  padding: 2rem max(16px, env(safe-area-inset-left, 0px)) 4.5rem max(16px, env(safe-area-inset-right, 0px));
}
.sidebar { grid-area: side; }
main { grid-area: main; min-width: 0; }
.toc { grid-area: toc; }
.sidebar, .toc {
  position: sticky;
  top: 1.5rem;
  align-self: start;
  max-height: calc(100vh - 3rem);
  overflow: auto;
}
.sidebar ol, .toc ol { margin: 0; padding: 0; list-style: none; }
.sidebar a {
  display: block;
  padding: .375rem .65rem;
  border-radius: 7px;
  color: var(--muted);
  font-size: 14px;
  text-decoration: none;
}
.sidebar a:hover { color: var(--ink); background: var(--raise); }
.sidebar a[aria-current="page"] {
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--accent), 0 0 0 1px var(--line);
}
.toc h2 {
  margin: 0 0 .6rem;
  color: var(--muted);
  font: 500 12px/1.2 var(--mono);
  letter-spacing: .04em;
  text-transform: uppercase;
}
.toc a {
  display: block;
  padding: .25rem 0;
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
  line-height: 1.4;
}
.toc a:hover { color: var(--ink); }
article { max-width: 70ch; overflow-wrap: break-word; }
article h1 {
  margin: 0 0 1rem;
  font-size: clamp(28px, 3.6vw, 38px);
  line-height: 1.12;
  letter-spacing: -0.035em;
  font-weight: 600;
  text-wrap: balance;
}
article h2 {
  margin: 2.5rem 0 .85rem;
  padding-bottom: .45rem;
  border-bottom: 1px solid var(--line);
  font-size: 22px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  font-weight: 600;
}
article h3 {
  margin: 2rem 0 .65rem;
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: -0.015em;
  font-weight: 600;
}
article h4 { margin: 1.5rem 0 .5rem; font-size: 15px; font-weight: 600; }
article :is(h2, h3, h4) { scroll-margin-top: 1.25rem; }
article p, article ul, article ol { margin: 0 0 1rem; }
article ul, article ol { padding-left: 1.35rem; }
article li + li { margin-top: .3rem; }
article a {
  color: var(--accent-ink);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent-ink) 40%, transparent);
  text-underline-offset: 3px;
}
article a:hover { text-decoration-color: var(--accent-ink); }
.anchor {
  margin-left: .45rem;
  color: var(--muted);
  text-decoration: none;
  opacity: 0;
  font-weight: 400;
}
:is(h2, h3, h4):hover .anchor, .anchor:focus { opacity: 1; }
article :not(pre) > code {
  font-size: .875em;
  padding: .14em .4em;
  border-radius: 5px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
  overflow-wrap: anywhere;
}
kbd {
  display: inline-block;
  font-size: .84em;
  line-height: 1.3;
  padding: .1em .42em;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 0 var(--line);
}
.code-block {
  margin: 1.25rem 0;
  border-radius: 10px;
  background: var(--code-bg);
  color: var(--code-ink);
  border: 1px solid var(--line);
  overflow: hidden;
}
.code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 14px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  font: 12px/1 var(--mono);
  color: var(--code-dim);
}
.code-head-nolang { justify-content: flex-end; }
.code-lang { text-transform: lowercase; letter-spacing: .02em; }
.code-copy {
  font: 500 12px/1.2 var(--sans);
  border: 1px solid rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 6%);
  color: var(--code-ink);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.code-copy:hover {
  background: rgb(255 255 255 / 12%);
  border-color: rgb(255 255 255 / 28%);
}
html:not(.js) .code-copy,
html:not(.js) .code-head-nolang { display: none; }
.code-block pre {
  margin: 0;
  padding: 14px 18px;
  overflow-x: auto;
  font: 13px/1.65 var(--mono);
  background: transparent;
  color: var(--code-ink);
}
.code-block pre code { font-size: inherit; background: none; border: 0; padding: 0; }
.table-wrap {
  margin: 1.25rem 0;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}
table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5; }
th, td { padding: .6rem .85rem; text-align: left; vertical-align: top; }
th {
  background: var(--raise);
  font-weight: 600;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
}
td { border-top: 1px solid var(--line); }
tbody tr:first-child td { border-top: 0; }
blockquote {
  margin: 1.25rem 0;
  padding: .75rem 1rem;
  border-left: 3px solid var(--accent);
  background: var(--surface);
  border-radius: 0 8px 8px 0;
  color: var(--muted);
}
blockquote p:last-child { margin-bottom: 0; }
.chapters { list-style: none; padding: 0; margin: 1.5rem 0 0; display: grid; gap: 10px; }
.chapters li {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  margin: 0;
}
.chapters a {
  font-weight: 600;
  font-size: 15px;
  color: var(--ink);
  text-decoration: none;
}
.chapters a:hover {
  color: var(--accent-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.chapters p { margin: .3rem 0 0; color: var(--muted); font-size: 14px; }
.edit {
  margin: 3rem 0 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--muted);
}
.edit a { color: var(--muted); text-decoration: none; }
.edit a:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 12.5rem minmax(0, 1fr);
    grid-template-areas: "side toc" "side main";
    gap: 1.5rem 2rem;
  }
  .toc {
    position: static;
    max-height: none;
    padding: .9rem 1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }
}
@media (max-width: 760px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "side" "toc" "main";
    gap: 1.25rem;
    padding-block: 1.25rem 3rem;
  }
  .sidebar {
    position: static;
    max-height: none;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--line);
  }
  .sidebar ol { display: flex; flex-wrap: wrap; gap: .4rem; }
  .sidebar a {
    padding: .3rem .65rem;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 13px;
  }
  .sidebar a[aria-current="page"] { box-shadow: none; border-color: var(--accent); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
