// Fixed tables that Alfred objects refer to by code: the System Web Search
// searchers (stored as FourCC integers) and the file types File Utility
// reports and File Filter matches.

import { extname } from "node:path";

/** Alfred's built-in web searches by FourCC; `{query}` is URL-encoded. */
export const WEB_SEARCHERS: Readonly<Record<string, { name: string; url: string }>> = {
  awgo: { name: "Google", url: "https://www.google.com/search?q={query}" },
  awty: { name: "YouTube", url: "https://www.youtube.com/results?search_query={query}" },
  awmo: { name: "IMDb", url: "https://www.imdb.com/find?q={query}" },
  awwi: { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search={query}" },
  awfb: { name: "Facebook", url: "https://www.facebook.com/search/top/?q={query}" },
  awts: { name: "X", url: "https://x.com/search?q={query}" },
  awwa: { name: "Wolfram|Alpha", url: "https://www.wolframalpha.com/input/?i={query}" },
  awam: { name: "Amazon", url: "https://www.amazon.com/s?k={query}" },
  awdu: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q={query}" },
  awgi: { name: "Google Images", url: "https://www.google.com/search?tbm=isch&q={query}" },
  awgm: { name: "Google Maps", url: "https://www.google.com/maps/search/?api=1&query={query}" },
  awgh: { name: "GitHub", url: "https://github.com/search?q={query}" },
  awbi: { name: "Bing", url: "https://www.bing.com/search?q={query}" },
  awso: { name: "Stack Overflow", url: "https://stackoverflow.com/search?q={query}" },
  awrd: { name: "Reddit", url: "https://www.reddit.com/search/?q={query}" },
};

/** A 32-bit big-endian FourCC (`0x6177676f` → `"awgo"`); four-letter strings pass through. */
export function fourCC(value: unknown): string {
  if (typeof value === "string") return value;
  const code = typeof value === "number" && Number.isInteger(value) ? value : 0;
  return [24, 16, 8, 0].map((shift) => String.fromCharCode((code >>> shift) & 0xff)).join("");
}

/** The search URL for `query`; throws a named error for an unknown searcher. */
export function webSearchUrl(searcher: unknown, query: string): string {
  const code = fourCC(searcher);
  if (!Object.hasOwn(WEB_SEARCHERS, code)) {
    throw new Error(`unknown web searcher ${JSON.stringify(code)}`);
  }
  return WEB_SEARCHERS[code]!.url.replace("{query}", encodeURIComponent(query));
}

const UTIS: Readonly<Record<string, string>> = {
  ".txt": "public.plain-text",
  ".md": "net.daringfireball.markdown",
  ".json": "public.json",
  ".csv": "public.comma-separated-values-text",
  ".xml": "public.xml",
  ".yaml": "public.yaml",
  ".yml": "public.yaml",
  ".pdf": "com.adobe.pdf",
  ".png": "public.png",
  ".jpg": "public.jpeg",
  ".jpeg": "public.jpeg",
  ".gif": "com.compuserve.gif",
  ".webp": "org.webmproject.webp",
  ".svg": "public.svg-image",
  ".tiff": "public.tiff",
  ".tif": "public.tiff",
  ".bmp": "com.microsoft.bmp",
  ".heic": "public.heic",
  ".mp3": "public.mp3",
  ".mp4": "public.mpeg-4",
  ".zip": "public.zip-archive",
  ".html": "public.html",
  ".app": "com.apple.application-bundle",
};

/** A best-effort Uniform Type Identifier, inferred from the path alone. */
export function fileUti(path: string, directory: boolean): string {
  const uti = UTIS[extname(path).toLowerCase()];
  // Spotlight reports app bundles as applications, not folders.
  if (directory) return uti === "com.apple.application-bundle" ? uti : "public.folder";
  return uti ?? "public.data";
}

// What each UTI conforms to, so `public.image` matches a PNG as Spotlight's
// `kMDItemContentTypeTree` does. Only the types in `UTIS` need entries.
const CONFORMS: Readonly<Record<string, readonly string[]>> = {
  "public.plain-text": ["public.text"],
  "net.daringfireball.markdown": ["public.plain-text"],
  "public.json": ["public.text"],
  "public.comma-separated-values-text": ["public.text"],
  "public.xml": ["public.text"],
  "public.yaml": ["public.text"],
  "public.html": ["public.text"],
  "public.text": ["public.data", "public.content"],
  "com.adobe.pdf": ["public.data", "public.composite-content"],
  "public.composite-content": ["public.content"],
  "public.png": ["public.image"],
  "public.jpeg": ["public.image"],
  "com.compuserve.gif": ["public.image"],
  "org.webmproject.webp": ["public.image"],
  "public.svg-image": ["public.image", "public.xml"],
  "public.tiff": ["public.image"],
  "com.microsoft.bmp": ["public.image"],
  "public.heic": ["public.image"],
  "public.image": ["public.data", "public.content"],
  "public.mp3": ["public.audio"],
  "public.audio": ["public.audiovisual-content"],
  "public.mpeg-4": ["public.movie"],
  "public.movie": ["public.audiovisual-content"],
  "public.audiovisual-content": ["public.data", "public.content"],
  "public.zip-archive": ["public.archive"],
  "public.archive": ["public.data"],
  "public.data": ["public.item"],
  "public.content": [],
  "com.apple.application-bundle": ["com.apple.application", "com.apple.package"],
  "com.apple.application": ["public.executable"],
  "public.executable": ["public.item"],
  "com.apple.package": ["public.directory"],
  "public.folder": ["public.directory"],
  "public.directory": ["public.item"],
};

/** `uti` and every type it conforms to (`public.png` → … `public.image` … `public.item`). */
export function utiTree(uti: string): string[] {
  const tree: string[] = [];
  const queue = [uti];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (tree.includes(next)) continue;
    tree.push(next);
    queue.push(...(CONFORMS[next] ?? []));
  }
  if (!tree.includes("public.item")) tree.push("public.item");
  return tree;
}

/**
 * Whether the file at `path` is one of `types` (exactly or through a
 * supertype such as `public.image`). An empty `types` allows everything.
 */
export function matchesUti(path: string, isDirectory: boolean, types: readonly string[]): boolean {
  if (types.length === 0) return true;
  const tree = utiTree(fileUti(path, isDirectory));
  return types.some((type) => tree.includes(type));
}
