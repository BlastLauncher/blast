import { createHighlighterCore, type ThemedToken } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import bash from "shiki/langs/bash.mjs";
import go from "shiki/langs/go.mjs";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import python from "shiki/langs/python.mjs";
import swift from "shiki/langs/swift.mjs";
import typescript from "shiki/langs/typescript.mjs";
import githubDarkDefault from "shiki/themes/github-dark-default.mjs";

export const HIGHLIGHT_THEME = "github-dark-default";

const DEFAULT_FG = (githubDarkDefault.fg ?? "#e6edf3").toUpperCase();

const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript",
  typescript: "typescript",
  cts: "typescript",
  mts: "typescript",
  js: "javascript",
  javascript: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  html: "html",
  go: "go",
  py: "python",
  python: "python",
  swift: "swift",
  json: "json",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
};

const highlighter = await createHighlighterCore({
  themes: [githubDarkDefault],
  langs: [typescript, javascript, html, go, python, swift, json, bash],
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

export function resolveHighlightLang(lang?: string): string | undefined {
  if (!lang) return undefined;
  return LANGUAGE_ALIASES[lang.trim().toLowerCase()];
}

function tokenStyle(token: ThemedToken): string | undefined {
  const color = token.color?.toUpperCase();
  if (!color || color === DEFAULT_FG) return undefined;
  return `color:${color}`;
}

function renderTokensLine(tokens: readonly ThemedToken[]): string {
  let out = "";
  let currentStyle: string | undefined;
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    const escaped = escapeHtml(buffer);
    out += currentStyle ? `<span style="${currentStyle}">${escaped}</span>` : escaped;
    buffer = "";
  };

  for (const token of tokens) {
    const style = tokenStyle(token);
    if (style !== currentStyle) {
      flush();
      currentStyle = style;
    }
    buffer += token.content;
  }
  flush();
  return out;
}

/**
 * Highlight `code` synchronously at build time as inner HTML for `<code>...</code>`.
 * Supported languages render `<span style="color:...">` tokens using `github-dark-default`;
 * `text` and unknown/unlabeled languages return escaped plain text.
 */
export function highlightCode(code: string, lang?: string): string {
  const resolved = resolveHighlightLang(lang);
  if (!resolved) return escapeHtml(code);
  const lines = highlighter.codeToTokensBase(code, {
    lang: resolved,
    theme: HIGHLIGHT_THEME,
  });
  return lines.map(renderTokensLine).join("\n");
}

/**
 * Highlight an NDJSON wire transcript while keeping `→` (sent) and `←` (received)
 * line prefixes colored and muting `…` truncation ellipses inside JSON payloads.
 */
export function highlightNdjson(transcript: string): string {
  return transcript
    .split("\n")
    .map((line) => {
      if (!line.startsWith("→ ") && !line.startsWith("← ")) return highlightCode(line, "json");
      const cls = line.startsWith("→") ? "t-in" : "t-out";
      const arrow = line[0]!;
      const tokens = highlighter.codeToTokensBase(line.slice(2), {
        lang: "json",
        theme: HIGHLIGHT_THEME,
      })[0]!;
      const rendered = tokens
        .map((token) => {
          const escaped = escapeHtml(token.content);
          if (token.content === "…") return `<span style="color:var(--code-dim)">${escaped}</span>`;
          const style = tokenStyle(token);
          return style ? `<span style="${style}">${escaped}</span>` : escaped;
        })
        .join("");
      return `<span class="${cls}">${arrow}</span> ${rendered}`;
    })
    .join("\n");
}
