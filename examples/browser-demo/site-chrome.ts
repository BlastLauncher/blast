import { escapeHtml } from "./highlight.ts";

// Shared design system tokens, Geist font faces, and header chrome for Blast site pages.

export const coverageUrl = "https://github.com/blastlauncher/blast/blob/main/compat/COVERAGE.md";
export const sweepUrl = "https://github.com/blastlauncher/blast/blob/main/SWEEP.md";
export const repoUrl = "https://github.com/blastlauncher/blast";
export const tmuxRepoUrl = "https://github.com/BlastLauncher/tmux-blast";

export const fontPreloadHtml =
  '<link rel="preload" href="/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>';

export const fontFacesCss = `@font-face {
  font-family: "Geist";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(/fonts/geist-latin-wght-normal.woff2) format("woff2-variations");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: "Geist Mono";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(/fonts/geist-mono-latin-wght-normal.woff2) format("woff2-variations");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}`;

export const themeTokensCss = `:root {
  --ground: #f4f5f6;
  --dot: rgb(20 22 26 / 8%);
  --surface: #ffffff;
  --raise: #eef0f2;
  --ink: #121316;
  --muted: #5b5f66;
  --line: #dcdee2;
  --accent: #ff6338;
  --accent-ink: #b23c1b;
  --code-bg: #121316;
  --code-ink: #e8e9eb;
  --code-dim: #8e939b;
  /* The terminal keeps blast-tui's own dark palette in both page themes. */
  --t-bg: #181825;
  --t-muted: #6c7086;
  --sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ground: #0d0e10;
    --dot: rgb(255 255 255 / 5%);
    --surface: #16171a;
    --raise: #1d1f22;
    --ink: #ececee;
    --muted: #9a9ea6;
    --line: #2a2c30;
    --accent: #ff7a55;
    --accent-ink: #ff9373;
    --code-bg: #08090a;
    --code-ink: #e3e4e6;
    --code-dim: #7d828a;
    color-scheme: dark;
  }
}`;

export const siteHeaderCss = `.wrap {
  max-width: 1160px;
  margin: 0 auto;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
header .wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block: 18px;
  gap: 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  text-decoration: none;
  font-size: 16px;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.mark {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: var(--accent);
  display: grid;
  place-items: center;
  flex: none;
}
.mark::after {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: #fff;
  transform: rotate(45deg);
}
header nav { display: flex; gap: 22px; font-size: 14px; color: var(--muted); }
header nav a { color: inherit; text-decoration: none; }
header nav a:hover { color: var(--ink); }
@media (max-width: 820px) {
  header nav a.opt { display: none; }
}`;

export function siteHeaderHtml(urls: {
  homeUrl: string;
  docsUrl: string;
  demoUrl: string;
}): string {
  return `<header>
    <div class="wrap">
      <a class="brand" href="${escapeHtml(urls.homeUrl)}"><span class="mark" aria-hidden="true"></span>Blast</a>
      <nav aria-label="Main">
        <a href="${escapeHtml(urls.docsUrl)}">Docs</a>
        <a href="${escapeHtml(urls.demoUrl)}" class="opt">Demo</a>
        <a href="${coverageUrl}" class="opt">Coverage</a>
        <a href="${repoUrl}">GitHub</a>
      </nav>
    </div>
  </header>`;
}
