// Fixed tables that Alfred objects refer to by code: the System Web Search
// searchers (stored as FourCC integers) and the file types File Utility
// reports.

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
  ".pdf": "com.adobe.pdf",
  ".png": "public.png",
  ".jpg": "public.jpeg",
  ".jpeg": "public.jpeg",
  ".gif": "com.compuserve.gif",
  ".mp3": "public.mp3",
  ".mp4": "public.mpeg-4",
  ".zip": "public.zip-archive",
  ".html": "public.html",
};

/** A best-effort Uniform Type Identifier, inferred from the path alone. */
export function fileUti(path: string, directory: boolean): string {
  if (directory) return "public.folder";
  return UTIS[extname(path).toLowerCase()] ?? "public.data";
}
