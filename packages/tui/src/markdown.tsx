/** @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import { theme } from "./theme.ts";

export type MarkdownStyle = "plain" | "heading" | "emphasis" | "code" | "link" | "quote" | "list";
export type MarkdownSegment = { text: string; style: MarkdownStyle };
export type MarkdownLine = { segments: MarkdownSegment[]; kind: MarkdownStyle };

function inline(source: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let rest = source;
  const push = (text: string, style: MarkdownStyle = "plain") => {
    if (text) segments.push({ text, style });
  };
  while (rest) {
    const match = rest.match(/^(?:`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/);
    if (!match) {
      const next = rest.search(/[`\[*_]/);
      if (next < 0) {
        push(rest);
        break;
      }
      if (next === 0) {
        // Keep malformed or unsupported markdown visible instead of looping
        // on the same delimiter forever.
        push(rest);
        break;
      }
      push(rest.slice(0, next));
      rest = rest.slice(next);
      continue;
    }
    if (match[1]) push(match[1], "code");
    else if (match[2]) {
      push(match[2]);
      push(` (${match[3]})`, "link");
    } else push(match[4] ?? match[5] ?? match[6] ?? match[7] ?? "", "emphasis");
    rest = rest.slice(match[0].length);
  }
  return segments.length ? segments : [{ text: "", style: "plain" }];
}

/** Parse the markdown subset that is useful in a terminal without hiding unknown text. */
export function renderMarkdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let fenced = false;
  for (const source of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (/^\s*```/.test(source)) {
      fenced = !fenced;
      if (!fenced) continue;
      lines.push({ segments: [{ text: "│ ", style: "code" }], kind: "code" });
      continue;
    }
    if (fenced) {
      lines.push({ segments: [{ text: `│ ${source}`, style: "code" }], kind: "code" });
      continue;
    }
    const heading = source.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      lines.push({ segments: [{ text: heading[2]!, style: "heading" }], kind: "heading" });
      continue;
    }
    const quote = source.match(/^\s*>\s?(.*)$/);
    if (quote) {
      lines.push({ segments: [{ text: `│ ${quote[1] ?? ""}`, style: "quote" }], kind: "quote" });
      continue;
    }
    const unordered = source.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      lines.push({ segments: [{ text: "• ", style: "list" }, ...inline(unordered[1]!)], kind: "list" });
      continue;
    }
    const ordered = source.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ordered) {
      lines.push({ segments: [{ text: `${ordered[1]}. `, style: "list" }, ...inline(ordered[2]!)], kind: "list" });
      continue;
    }
    lines.push({ segments: inline(source), kind: "plain" });
  }
  return lines;
}

function color(style: MarkdownStyle): string {
  if (style === "heading") return theme.colors.accent;
  if (style === "link") return theme.colors.textMuted;
  if (style === "quote") return theme.colors.warning;
  if (style === "code") return theme.colors.success;
  return theme.colors.text;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const lines = renderMarkdownLines(markdown);
  return (
    <box flexDirection="column" flexShrink={0}>
      {lines.map((line, index) => (
        <text key={index} flexShrink={0} fg={theme.colors.text}>
          {line.segments.map((segment, segmentIndex) => (
            <span
              key={segmentIndex}
              fg={color(segment.style)}
              {...(segment.style === "heading" || segment.style === "emphasis"
                ? { attributes: TextAttributes.BOLD }
                : {})}
            >
              {segment.text}
            </span>
          ))}
        </text>
      ))}
    </box>
  );
}
