/** @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import { theme } from "./theme.ts";

/**
 * The markdown subset that reads well in a terminal. Anything the parser does
 * not understand stays on screen as its source text: no input is swallowed.
 */
export type MarkdownStyle =
  | "plain"
  | "strong"
  | "emphasis"
  | "strike"
  | "code"
  | "link"
  | "url"
  | "marker";
export type MarkdownLineKind = "blank" | "paragraph" | "heading" | "list" | "quote" | "code";
export type MarkdownSegment = { text: string; style: MarkdownStyle };
export type MarkdownLine = { kind: MarkdownLineKind; level?: number; segments: MarkdownSegment[] };

// Order matters: a link, a strong marker and inline code must win over the
// single-character emphasis forms. Underscore emphasis ignores word interiors.
const inlinePattern =
  /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/;

function inline(source: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const push = (text: string, style: MarkdownStyle = "plain") => {
    if (text) segments.push({ text, style });
  };
  let rest = source;
  while (rest) {
    const match = inlinePattern.exec(rest);
    if (!match) {
      push(rest);
      break;
    }
    if (match.index > 0) {
      push(rest.slice(0, match.index));
      rest = rest.slice(match.index);
      continue;
    }
    const [whole, linkText, url, strong, strongUnderscore, strike, code, emphasis, underlined] =
      match;
    if (linkText !== undefined) {
      push(linkText, "link");
      push(` (${url})`, "url");
    } else if (strong !== undefined || strongUnderscore !== undefined)
      push(strong ?? strongUnderscore ?? "", "strong");
    else if (strike !== undefined) push(strike, "strike");
    else if (code !== undefined) push(code, "code");
    else push(emphasis ?? underlined ?? "", "emphasis");
    rest = rest.slice(whole.length);
  }
  return segments;
}

const fencePattern = /^\s*(`{3,}|~{3,})\s*(.*)$/;
const headingPattern = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const quotePattern = /^ {0,3}>\s?(.*)$/;
const unorderedPattern = /^(\s*)[-*+]\s+(.*)$/;
const orderedPattern = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;

/** Parse the markdown subset that is useful in a terminal without hiding unknown text. */
export function renderMarkdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let fence: { marker: string; length: number } | undefined;
  for (const raw of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const source = raw.replace(/\r$/, "");
    const fenceLine = fencePattern.exec(source);
    if (fence) {
      if (
        fenceLine &&
        fenceLine[1]!.startsWith(fence.marker) &&
        fenceLine[1]!.length >= fence.length
      ) {
        fence = undefined;
        continue;
      }
      lines.push({ kind: "code", segments: [{ text: source, style: "code" }] });
      continue;
    }
    if (fenceLine) {
      fence = { marker: fenceLine[1]!.slice(0, 1), length: fenceLine[1]!.length };
      continue;
    }
    if (source.trim() === "") {
      lines.push({ kind: "blank", segments: [] });
      continue;
    }
    const heading = headingPattern.exec(source);
    if (heading) {
      lines.push({
        kind: "heading",
        level: heading[1]!.length,
        segments: inline(heading[2]!),
      });
      continue;
    }
    const quote = quotePattern.exec(source);
    if (quote) {
      lines.push({
        kind: "quote",
        segments: [{ text: "│ ", style: "marker" }, ...inline(quote[1]!)],
      });
      continue;
    }
    const unordered = unorderedPattern.exec(source);
    if (unordered) {
      lines.push({
        kind: "list",
        segments: [{ text: `${unordered[1] ?? ""}• `, style: "marker" }, ...inline(unordered[2]!)],
      });
      continue;
    }
    const ordered = orderedPattern.exec(source);
    if (ordered) {
      lines.push({
        kind: "list",
        segments: [
          { text: `${ordered[1] ?? ""}${ordered[2]}. `, style: "marker" },
          ...inline(ordered[3]!),
        ],
      });
      continue;
    }
    lines.push({ kind: "paragraph", segments: inline(source) });
  }
  return lines;
}

function segmentColor(style: MarkdownStyle): string | undefined {
  if (style === "code") return theme.colors.success;
  if (style === "link" || style === "marker") return theme.colors.accent;
  if (style === "url") return theme.colors.textMuted;
  // Plain text, strong and emphasis inherit the line colour.
  return undefined;
}

function segmentAttributes(style: MarkdownStyle, line: MarkdownLine): number {
  let attributes = TextAttributes.NONE;
  if (line.kind === "heading") {
    attributes |= TextAttributes.BOLD;
    if ((line.level ?? 1) <= 2) attributes |= TextAttributes.UNDERLINE;
  }
  if (style === "strong") attributes |= TextAttributes.BOLD;
  else if (style === "emphasis") attributes |= TextAttributes.ITALIC;
  else if (style === "strike") attributes |= TextAttributes.STRIKETHROUGH;
  else if (style === "link") attributes |= TextAttributes.UNDERLINE;
  return attributes;
}

function lineColor(line: MarkdownLine): string {
  if (line.kind === "heading") return theme.colors.accent;
  if (line.kind === "quote") return theme.colors.textMuted;
  return theme.colors.text;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const lines = renderMarkdownLines(markdown);
  return (
    <box flexDirection="column" flexShrink={0}>
      {lines.map((line, index) => (
        <text key={index} flexShrink={0} fg={lineColor(line)}>
          {line.kind === "blank" ? " " : null}
          {line.kind === "code" ? <span fg={theme.colors.border}>│ </span> : null}
          {line.kind === "blank"
            ? null
            : line.segments.map((segment, segmentIndex) => {
                const color = segmentColor(segment.style);
                const attributes = segmentAttributes(segment.style, line);
                return (
                  <span
                    key={segmentIndex}
                    {...(color === undefined ? {} : { fg: color })}
                    {...(attributes === 0 ? {} : { attributes })}
                  >
                    {segment.text}
                  </span>
                );
              })}
        </text>
      ))}
    </box>
  );
}
