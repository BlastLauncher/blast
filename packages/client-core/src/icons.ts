import type { JsonValue } from "@blastlauncher/protocol";

export type IconView = { label: string; tintColor?: string };

const glyphs: Record<string, string> = {
  add: "+",
  arrow: "→",
  bell: "♢",
  bolt: "ϟ",
  book: "▤",
  calendar: "▣",
  check: "✓",
  chevron: "›",
  circle: "●",
  clock: "◷",
  clipboard: "▧",
  cloud: "☁",
  code: "<> ".trim(),
  copy: "⧉",
  download: "↓",
  eye: "◉",
  file: "▤",
  finder: "⌕",
  folder: "▰",
  gear: "⚙",
  globe: "⊕",
  heart: "♥",
  info: "ⓘ",
  link: "↗",
  mail: "✉",
  magnifying: "⌕",
  menu: "≡",
  pause: "Ⅱ",
  pencil: "✎",
  person: "●",
  play: "▶",
  plus: "+",
  question: "?",
  refresh: "↻",
  search: "⌕",
  star: "★",
  tag: "⌑",
  trash: "⌫",
  upload: "↑",
  warning: "⚠",
  x: "×",
};

const tintNames: Record<string, string> = {
  "raycast-blue": "#89b4fa",
  "raycast-green": "#a6e3a1",
  "raycast-orange": "#fab387",
  "raycast-purple": "#cba6f7",
  "raycast-red": "#f38ba8",
  "raycast-yellow": "#f9e2af",
};

function tintOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.dark === "string") return value.dark;
    if (typeof value.light === "string") return value.light;
  }
  return undefined;
}

function sourceOf(value: JsonValue | undefined): { source?: string; tintColor?: string } {
  if (typeof value === "string") return { source: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if ("fileIcon" in value && typeof value.fileIcon === "string") return { source: "file" };
  if ("source" in value) {
    const source = value.source;
    if (typeof source === "string")
      return {
        source,
        ...(tintOf(value.tintColor) ? { tintColor: tintOf(value.tintColor) } : {}),
      };
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const dark = source.dark;
      const light = source.light;
      const selected = typeof dark === "string" ? dark : typeof light === "string" ? light : undefined;
      return {
        ...(selected ? { source: selected } : {}),
        ...(tintOf(value.tintColor) ? { tintColor: tintOf(value.tintColor) } : {}),
      };
    }
  }
  return {};
}

function normalize(source: string): string {
  return source
    .replace(/(?:[\\/]|\.[a-z0-9]+$)/gi, " ")
    .replace(/-16\b/g, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Convert Raycast image/icon values to a compact terminal representation. */
export function iconView(value: JsonValue | undefined): IconView {
  const { source, tintColor } = sourceOf(value);
  if (!source) return { label: "◇" };
  const name = normalize(source);
  const key = Object.keys(glyphs).find((candidate) => name.includes(candidate));
  const label = key ? glyphs[key]! : source.includes(".") ? "▣" : source.slice(0, 12);
  const tint = tintColor ? (tintNames[tintColor] ?? tintColor) : undefined;
  return { label: label || "◇", ...(tint ? { tintColor: tint } : {}) };
}
