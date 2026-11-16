import { describe, expect, test } from "bun:test";
import { escapeHtml, highlightCode, highlightNdjson, resolveHighlightLang } from "./highlight.ts";

function stripTagsAndUnescape(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("build-time syntax highlighter", () => {
  test("resolves the supported languages and leaves text/unknown unhighlighted", () => {
    for (const lang of ["ts", "js", "html", "go", "python", "py", "swift", "json", "sh", "bash"])
      expect(resolveHighlightLang(lang)).toBeDefined();
    expect(resolveHighlightLang("text")).toBeUndefined();
    expect(resolveHighlightLang("")).toBeUndefined();
    expect(resolveHighlightLang(undefined)).toBeUndefined();
    expect(resolveHighlightLang("unknown-lang")).toBeUndefined();
  });

  test("highlights every supported language with token spans and preserves exact text", () => {
    const samples: Array<[string, string]> = [
      ["ts", "const count: number = 42; // note\nexport default count;"],
      ["js", 'import { mount } from "/blast/blast-web.js";\nmount("#app");'],
      ["html", '<div id="app"></div>\n<script>alert(1)</script>'],
      ["go", 'client, _ := Start("main.ts", os.Stdout) // start'],
      ["python", "from embedder import Client # comment\nclient = Client()"],
      ["swift", "let root = try await blast.openRoot(views: .macOS)"],
      ["json", '{"type":"hello","protocol":1,"ok":true}'],
      ["sh", 'npm install @blastlauncher/engine@next\nblast run "$EXT"'],
    ];
    const usedColors = new Set<string>();
    for (const [lang, source] of samples) {
      const html = highlightCode(source, lang);
      expect(html).toContain('<span style="color:#');
      expect(stripTagsAndUnescape(html)).toBe(source);
      for (const match of html.matchAll(/color:(#[0-9a-f]{6})/gi))
        usedColors.add(match[1]!.toUpperCase());
    }
    expect(usedColors.size).toBeGreaterThan(3);
    for (const color of usedColors) {
      expect(contrastRatio(color, "#121316")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color, "#08090a")).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("escapes HTML and leaves plain text / unlabeled code free of token spans", () => {
    const raw = '<script>alert("xss")</script> & <command>';
    expect(highlightCode(raw)).toBe(escapeHtml(raw));
    expect(highlightCode(raw, "text")).toBe(escapeHtml(raw));
    expect(highlightCode(raw, "text")).not.toContain("<span");
    const htmlHighlighted = highlightCode(raw, "html");
    expect(htmlHighlighted).not.toContain("<script");
    expect(stripTagsAndUnescape(htmlHighlighted)).toBe(raw);
  });

  test("highlights NDJSON lines with sent/received prefix classes and JSON tokens", () => {
    const transcript = [
      '→ {"type":"hello","protocol":1}',
      '← {"type":"welcome","engine":{…}}',
    ].join("\n");
    const html = highlightNdjson(transcript);
    expect(html).toContain('<span class="t-in">→</span>');
    expect(html).toContain('<span class="t-out">←</span>');
    expect(html).toContain('<span style="color:#');
    expect(html).toContain('<span style="color:var(--code-dim)">…</span>');
    expect(stripTagsAndUnescape(html)).toBe(transcript);
  });
});
