import { readFile, mkdir, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { Marked } from "marked";
import { projectRoot } from "./build.ts";

export const repoUrl = "https://github.com/blastlauncher/blast";

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

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
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
        const language = (lang ?? "").match(/^[\w+-]+/)?.[0];
        const attribute = language ? ` class="language-${language}"` : "";
        return `<pre><code${attribute}>${escapeHtml(text.replace(/\n$/, ""))}</code></pre>\n`;
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
<link rel="stylesheet" href="/docs/docs.css">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="site-header">
<a class="home" href="/">Blast</a>
<nav aria-label="Site"><a href="/docs/">Docs</a><a href="/demo/">Demo</a><a href="${repoUrl}">GitHub</a></nav>
</header>
<div class="layout">
<nav class="sidebar" aria-label="Chapters"><ol>${sidebar}</ol></nav>
<main id="content">
<article>
${options.article}</article>
<p class="edit"><a href="${options.source}">Edit on GitHub</a></p>
</main>
${tocHtml}
</div>
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

export const docsCss = `:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--soft:#f6f8fa;--link:#0969da;--accent:#e5482a}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--border:#3d444d;--soft:#161b22;--link:#4493f8;--accent:#ff6338}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
code,kbd,pre{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:.875em}
a{color:var(--link)}
a:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:2px}
.skip{position:absolute;left:-999px;top:.5rem;padding:.5rem .75rem;background:var(--bg);border:1px solid var(--border)}
.skip:focus{left:.5rem}
.site-header{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1.25rem;padding:.75rem 1.25rem;border-bottom:1px solid var(--border)}
.site-header .home{margin-right:auto;color:var(--fg);font-size:1.125rem;font-weight:700;text-decoration:none}
.site-header nav{display:flex;gap:1.25rem}
.site-header nav a{color:var(--fg);text-decoration:none}
.site-header nav a:hover{text-decoration:underline}
.layout{display:grid;grid-template-columns:14rem minmax(0,1fr) 14rem;grid-template-areas:"side main toc";gap:2.5rem;max-width:84rem;margin:0 auto;padding:1.5rem 1.25rem 4rem}
.sidebar{grid-area:side}
main{grid-area:main;min-width:0}
.toc{grid-area:toc}
.sidebar,.toc{position:sticky;top:1rem;align-self:start;max-height:calc(100vh - 2rem);overflow:auto}
.sidebar ol,.toc ol{margin:0;padding:0;list-style:none}
.sidebar a{display:block;padding:.3rem .6rem;border-radius:6px;color:var(--fg);text-decoration:none}
.sidebar a:hover{background:var(--soft)}
.sidebar a[aria-current="page"]{background:var(--soft);font-weight:600;box-shadow:inset 3px 0 0 var(--accent)}
.toc h2{margin:0 0 .5rem;color:var(--muted);font-size:.75rem;letter-spacing:.06em;text-transform:uppercase}
.toc a{display:block;padding:.2rem 0;color:var(--muted);font-size:.875rem;text-decoration:none}
.toc a:hover{color:var(--link)}
article{max-width:46rem;overflow-wrap:break-word}
article h1{margin:0 0 1rem;font-size:2rem;line-height:1.25}
article h2{margin:2.5rem 0 1rem;padding-bottom:.3rem;border-bottom:1px solid var(--border);font-size:1.5rem;line-height:1.3}
article h3{margin:2rem 0 .75rem;font-size:1.2rem;line-height:1.3}
article h4{margin:1.5rem 0 .5rem;font-size:1rem}
article :is(h2,h3,h4){scroll-margin-top:1rem}
.anchor{margin-left:.4rem;color:var(--muted);text-decoration:none;opacity:0}
:is(h2,h3,h4):hover .anchor,.anchor:focus{opacity:1}
article :not(pre)>code{padding:.15em .35em;border-radius:4px;background:var(--soft);overflow-wrap:anywhere}
pre{margin:1rem 0;padding:1rem;border:1px solid var(--border);border-radius:8px;background:var(--soft);overflow-x:auto;line-height:1.45}
pre code{font-size:inherit}
kbd{padding:.05em .4em;border:1px solid var(--border);border-bottom-width:2px;border-radius:4px;background:var(--soft)}
.table-wrap{margin:1rem 0;overflow-x:auto}
table{border-collapse:collapse;font-size:.9375rem}
th,td{padding:.4rem .7rem;border:1px solid var(--border);text-align:left;vertical-align:top}
th{background:var(--soft)}
blockquote{margin:1rem 0;padding:0 1rem;border-left:4px solid var(--border);color:var(--muted)}
.chapters{padding-left:1.25rem}
.chapters li{margin:0 0 1rem}
.chapters a{font-weight:600}
.chapters p{margin:.2rem 0 0;color:var(--muted)}
.edit{margin:3rem 0 0;padding-top:1rem;border-top:1px solid var(--border);font-size:.875rem}
@media (max-width:72rem){.layout{grid-template-columns:13rem minmax(0,1fr);grid-template-areas:"side toc" "side main";gap:1.5rem 2rem}.toc{position:static;max-height:none;padding:.75rem 1rem;border:1px solid var(--border);border-radius:8px}}
@media (max-width:48rem){.layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"side" "toc" "main";gap:1.25rem;padding:1rem}.sidebar{position:static;max-height:none;padding-bottom:1rem;border-bottom:1px solid var(--border)}.sidebar ol{display:flex;flex-wrap:wrap;gap:.35rem}.sidebar a{padding:.2rem .6rem;border:1px solid var(--border);font-size:.875rem}.sidebar a[aria-current="page"]{box-shadow:none;border-color:var(--accent)}article h1{font-size:1.6rem}}
`;
