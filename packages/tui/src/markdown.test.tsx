import { expect, test } from "bun:test";
import { renderMarkdownLines } from "./markdown.tsx";

const texts = (markdown: string) =>
  renderMarkdownLines(markdown).map((line) =>
    line.segments.map((segment) => segment.text).join(""),
  );

test("markdown: headings keep their level and render inline emphasis", () => {
  const lines = renderMarkdownLines("# Title\n### Detail **now**");
  expect(lines[0]).toMatchObject({ kind: "heading", level: 1 });
  expect(lines[0]?.segments).toEqual([{ text: "Title", style: "plain" }]);
  expect(lines[1]).toMatchObject({ kind: "heading", level: 3 });
  expect(lines[1]?.segments).toEqual([
    { text: "Detail ", style: "plain" },
    { text: "now", style: "strong" },
  ]);
});

test("markdown: emphasis, strong and strikethrough styles are distinct", () => {
  const [line] = renderMarkdownLines("**bold** *italic* _also_ __heavy__ ~~gone~~");
  expect(line?.segments).toEqual([
    { text: "bold", style: "strong" },
    { text: " ", style: "plain" },
    { text: "italic", style: "emphasis" },
    { text: " ", style: "plain" },
    { text: "also", style: "emphasis" },
    { text: " ", style: "plain" },
    { text: "heavy", style: "strong" },
    { text: " ", style: "plain" },
    { text: "gone", style: "strike" },
  ]);
  // Underscores inside identifiers are part of the word, not emphasis markers.
  expect(texts("snake_case_name")).toEqual(["snake_case_name"]);
});

test("markdown: lists, quotes and inline code", () => {
  expect(texts("- first\n* second\n+ third\n  - nested\n1. one\n2) two")).toEqual([
    "• first",
    "• second",
    "• third",
    "  • nested",
    "1. one",
    "2. two",
  ]);
  const [quote] = renderMarkdownLines("> quoted `code`");
  expect(quote?.kind).toBe("quote");
  expect(quote?.segments).toEqual([
    { text: "│ ", style: "marker" },
    { text: "quoted ", style: "plain" },
    { text: "code", style: "code" },
  ]);
  expect(texts("use `npm install`")).toEqual(["use npm install"]);
});

test("markdown: links keep the text and show a dimmed URL", () => {
  const [line] = renderMarkdownLines("Read [the docs](https://example.com/guide) today");
  expect(line?.segments).toEqual([
    { text: "Read ", style: "plain" },
    { text: "the docs", style: "link" },
    { text: " (https://example.com/guide)", style: "url" },
    { text: " today", style: "plain" },
  ]);
});

test("markdown: fenced code blocks keep their lines and close on the same marker", () => {
  expect(renderMarkdownLines("```ts\nconst x = 1;\n\n```\nafter").map((line) => line.kind)).toEqual(
    ["code", "code", "paragraph"],
  );
  expect(texts("```\nconst x = 1;\n```\nafter")).toEqual(["const x = 1;", "after"]);
  expect(texts("~~~\ntilde\n~~~")).toEqual(["tilde"]);
  // An unclosed fence degrades to code, never to a lost line.
  expect(texts("```\nnever closed")).toEqual(["never closed"]);
});

test("markdown: syntax outside the supported subset stays visible as source", () => {
  const source = ["---", "| a | b |", "<kbd>Ctrl</kbd>", "*unclosed", "_dangling", "![alt](x)"];
  expect(texts(source.join("\n"))).toEqual([
    "---",
    "| a | b |",
    "<kbd>Ctrl</kbd>",
    "*unclosed",
    "_dangling",
    "!alt (x)",
  ]);
});

test("markdown: empty input is a single blank line", () => {
  expect(renderMarkdownLines("")).toEqual([{ kind: "blank", segments: [] }]);
});
