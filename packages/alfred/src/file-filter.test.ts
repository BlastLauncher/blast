import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { matchesUti } from "./catalogs.ts";
import {
  buildMdfindQuery,
  DEFAULT_FILE_LIMIT,
  fileFilterConfig,
  MAX_FILE_RESULTS,
  resolveScopes,
  searchFiles,
  searchFilesPortable,
  type FileFilterMatch,
  type FileFilterOptions,
} from "./file-filter.ts";
import { MAX_SCENE_ITEMS } from "./runtime.ts";

const NOW = Date.UTC(2026, 10, 27, 12);
const DAY = 24 * 60 * 60 * 1000;

let root = "";
// Relative path → age in days; directories end in `/`.
const TREE: Record<string, number> = {
  "docs/report.pdf": 2,
  "docs/notes.txt": 10,
  "docs/Readme.md": 40,
  "docs/data.csv": 100,
  "images/photo.png": 1,
  "images/logo.svg": 5,
  "images/pic.webp": 20,
  "images/old.jpg": 200,
  "images/nested/deep/report-shot.png": 3,
  "Apps/Tool.app/Contents/inner.png": 1,
  ".hidden/secret.txt": 1,
  ".dotfile.txt": 1,
  "Café report.txt": 4,
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "blast-alfred-files-"));
  for (const [relative, days] of Object.entries(TREE)) {
    const path = join(root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, relative);
    // A minute inside each range boundary.
    const time = new Date(NOW - days * DAY + 60_000);
    await utimes(path, time, time);
  }
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const options = (extra: Partial<FileFilterOptions> = {}): FileFilterOptions => ({
  query: "",
  scopes: [root],
  homeDir: root,
  now: () => NOW,
  ...extra,
});
const rel = (matches: FileFilterMatch[]): string[] =>
  matches.map((match) => match.path.slice(root.length + 1));
const search = async (extra: Partial<FileFilterOptions>) =>
  rel(await searchFilesPortable(options(extra)));
const expand = (text: string) => text.replace("{var:dir}", "/work");
// Stand-ins for `mdfind`, so no test ever spawns it.
const never = async (): Promise<string[]> => {
  throw new Error("mdfind must not run");
};
const failing = async (): Promise<string[]> => {
  throw new Error("spawn /usr/bin/mdfind ENOENT");
};
const empty = async (): Promise<string[]> => [];

describe("matchesUti", () => {
  test("exact UTIs and supertypes", () => {
    expect(matchesUti("/a/photo.png", false, ["public.png"])).toBe(true);
    expect(matchesUti("/a/photo.png", false, ["public.jpeg"])).toBe(false);
    for (const name of ["a.webp", "a.svg", "a.TIFF", "a.tif", "a.bmp", "a.heic", "a.gif"]) {
      expect({ name, image: matchesUti(`/x/${name}`, false, ["public.image"]) }).toEqual({
        name,
        image: true,
      });
    }
    expect(matchesUti("/a/song.mp3", false, ["public.audio"])).toBe(true);
    expect(matchesUti("/a/clip.mp4", false, ["public.movie"])).toBe(true);
    expect(matchesUti("/a/notes.md", false, ["public.text"])).toBe(true);
    expect(matchesUti("/a/data.csv", false, ["public.plain-text", "public.text"])).toBe(true);
    expect(matchesUti("/a/conf.yml", false, ["public.yaml"])).toBe(true);
    expect(matchesUti("/a/doc.pdf", false, ["public.content"])).toBe(true);
    expect(matchesUti("/a/doc.pdf", false, ["public.image"])).toBe(false);
    expect(matchesUti("/a/unknown.xyz", false, ["public.item"])).toBe(true);
    expect(matchesUti("/a/unknown.xyz", false, ["public.data"])).toBe(true);
    expect(matchesUti("/a/unknown.xyz", false, [])).toBe(true);
  });

  test("folders and app bundles", () => {
    expect(matchesUti("/a/folder", true, ["public.folder"])).toBe(true);
    expect(matchesUti("/a/photos.png", true, ["public.image"])).toBe(false);
    expect(matchesUti("/a/file", false, ["public.folder"])).toBe(false);
    expect(matchesUti("/a/Tool.app", true, ["com.apple.application-bundle"])).toBe(true);
    expect(matchesUti("/a/Tool.app", true, ["public.folder"])).toBe(false);
    expect(matchesUti("/a/Tool.app", true, ["public.directory"])).toBe(true);
  });
});

describe("buildMdfindQuery", () => {
  test("escapes quotes, backslashes and wildcards in query words", () => {
    expect(buildMdfindQuery(`it's a\\b *x`, {})).toBe(
      String.raw`kMDItemFSName == '*it\'s*'cd && kMDItemFSName == '*a\\b*'cd && kMDItemFSName == '*\*x*'cd`,
    );
  });

  test("an empty query with no filters matches every file name", () => {
    expect(buildMdfindQuery("  ", {})).toBe("kMDItemFSName == '*'");
  });

  test("UTIs, field filters and date ranges", () => {
    expect(
      buildMdfindQuery("cat", {
        types: ["public.image", "com.adobe.pdf"],
        fields: [
          { field: "kMDItemDisplayName", not: true, value: ".app" },
          { field: "kMDItemAuthors", value: "ann bob", split: true, words: true },
          { field: "kMDItemContentType", value: "public.png" },
          { field: "bad name) || (x", value: "y" },
        ],
        daterange: 3,
      }),
    ).toBe(
      [
        "kMDItemFSName == '*cat*'cd",
        "(kMDItemContentTypeTree == 'public.image' || kMDItemContentTypeTree == 'com.adobe.pdf')",
        "(kMDItemDisplayName != '*.app*'cd)",
        "(kMDItemAuthors == 'ann*'cdw || kMDItemAuthors == 'bob*'cdw)",
        "(kMDItemContentType == 'public.png')",
        "kMDItemFSContentChangeDate >= $time.today(-7)",
      ].join(" && "),
    );
    expect(buildMdfindQuery("", { daterange: 1 })).toBe(
      "kMDItemFSContentChangeDate >= $time.today(-1)",
    );
    expect(buildMdfindQuery("", { daterange: 5 })).toContain("$time.today(-90)");
    expect(buildMdfindQuery("", { daterange: 9 })).toBe("kMDItemFSName == '*'");
  });

  test("a negated split filter must avoid every alternative", () => {
    expect(
      buildMdfindQuery("", {
        fields: [{ field: "kMDItemFSName", value: "a b", split: true, not: true }],
      }),
    ).toBe("(kMDItemFSName != '*a*'cd && kMDItemFSName != '*b*'cd)");
  });

  test("skips default Alfred {query} template fields instead of emitting literal {query}", () => {
    expect(
      buildMdfindQuery("cat", {
        fields: [
          { field: "kMDItemDisplayName", value: "{query}", split: true, words: true },
          { field: "kMDItemDisplayName", not: true, value: ".app" },
        ],
      }),
    ).toBe("kMDItemFSName == '*cat*'cd && (kMDItemDisplayName != '*.app*'cd)");
  });
});

describe("fileFilterConfig", () => {
  test("reads scopes, types, fields and numbers, expanding placeholders", () => {
    expect(
      fileFilterConfig(
        {
          scopes: ["{var:dir}/a", "", "~/b"],
          types: ["public.png", " "],
          fields: [
            { field: "kMDItemDisplayName", not: true, value: ".app", split: false, words: false },
            { field: "", value: "x" },
            "junk",
          ],
          daterange: 2,
          sortmode: "1",
          limit: 10,
        },
        expand,
      ),
    ).toEqual({
      scopes: ["/work/a", "~/b"],
      types: ["public.png"],
      fields: [{ field: "kMDItemDisplayName", value: ".app", not: true }],
      daterange: 2,
      sortmode: 1,
      limit: 10,
    });
    expect(fileFilterConfig({ scopes: "/one" }).scopes).toEqual(["/one"]);
    expect(fileFilterConfig({})).toEqual({
      scopes: [],
      types: [],
      fields: [],
      daterange: 0,
      sortmode: 0,
      limit: 0,
    });
  });

  test("resolveScopes expands ~, de-duplicates and defaults to the home folder", () => {
    expect(resolveScopes([], "/home/me")).toEqual(["/home/me"]);
    expect(
      resolveScopes(["~", "~/Documents", "/tmp/x/../y", "/home/me", "rel"], "/home/me"),
    ).toEqual(["/home/me", "/home/me/Documents", "/tmp/y", "/home/me/rel"]);
  });
});

describe("searchFilesPortable", () => {
  test("matches every query word in the name, ignoring case and diacritics", async () => {
    expect(await search({ query: "REPORT" })).toEqual([
      "docs/report.pdf",
      "images/nested/deep/report-shot.png",
      "Café report.txt",
    ]);
    expect(await search({ query: "cafe rep" })).toEqual(["Café report.txt"]);
  });

  test("ranks names starting with the query before names containing it", async () => {
    expect(await search({ query: "o" })).toContain("images/old.jpg");
    const ranked = await search({ query: "re" });
    expect(ranked.indexOf("docs/report.pdf")).toBeLessThan(ranked.indexOf("Café report.txt"));
  });

  test("an empty query lists everything in the scopes, shallowest first", async () => {
    const all = await search({});
    expect(all.slice(0, 4)).toEqual(["Apps", "Café report.txt", "docs", "images"]);
    expect(all).toContain("images/nested/deep/report-shot.png");
  });

  test("scopes limit the walk and ~ resolves against the home folder", async () => {
    // Equal rank keeps walk order, which is code-unit order: "R" before "n".
    expect(await search({ scopes: ["~/docs"], query: "e" })).toEqual([
      "docs/Readme.md",
      "docs/notes.txt",
      "docs/report.pdf",
    ]);
    expect(
      await search({ scopes: [join(root, "docs"), join(root, "images/nested")], query: "report" }),
    ).toEqual(["docs/report.pdf", "images/nested/deep/report-shot.png"]);
    expect(await search({ scopes: [join(root, "missing")] })).toEqual([]);
  });

  test("types filter by UTI, including folders", async () => {
    expect(await search({ types: ["public.image"], sortmode: 2 })).toEqual([
      "images/logo.svg",
      "images/old.jpg",
      "images/photo.png",
      "images/pic.webp",
      "images/nested/deep/report-shot.png",
    ]);
    expect(await search({ types: ["public.folder"], sortmode: 2 })).toEqual([
      "Apps",
      "images/nested/deep",
      "docs",
      "images",
      "images/nested",
    ]);
    expect(await search({ types: ["com.apple.application-bundle"] })).toEqual(["Apps/Tool.app"]);
  });

  test("hidden entries only for a query starting with a dot; bundles are not entered", async () => {
    const all = await search({});
    expect(all.some((path) => path.includes(".hidden") || path.includes(".dotfile"))).toBe(false);
    expect(all.some((path) => path.includes("Tool.app/"))).toBe(false);
    expect(await search({ query: ".dot" })).toEqual([".dotfile.txt"]);
    expect(await search({ query: ".txt" })).toContain(".hidden/secret.txt");
  });

  test("field filters include and exclude", async () => {
    expect(
      await search({
        query: "report",
        fields: [{ field: "kMDItemDisplayName", not: true, value: ".png" }],
      }),
    ).toEqual(["docs/report.pdf", "Café report.txt"]);
    expect(
      await search({
        fields: [
          { field: "kMDItemFSName", value: ".pdf .csv", split: true },
          // Spotlight-only attributes cannot be judged from a path; the walk skips them.
          { field: "kMDItemAuthors", value: "nobody" },
        ],
      }),
    ).toEqual(["docs/data.csv", "docs/report.pdf"]);
    expect(
      await search({
        scopes: ["~/images"],
        fields: [{ field: "kMDItemContentTypeTree", not: true, value: "public.image" }],
      }),
    ).toEqual(["images/nested", "images/nested/deep"]);
    expect(await search({ fields: [{ field: "kMDItemPath", value: "nested/deep/" }] })).toEqual([
      "images/nested/deep/report-shot.png",
    ]);
  });

  test("date ranges keep recently changed entries", async () => {
    const files = { types: ["public.data"], sortmode: 2 } as const;
    expect(await search({ ...files, daterange: 1 })).toEqual(["images/photo.png"]);
    expect(await search({ ...files, daterange: 2 })).toEqual([
      "images/photo.png",
      "images/nested/deep/report-shot.png",
      "docs/report.pdf",
    ]);
    expect(await search({ ...files, daterange: 4 })).toHaveLength(7);
    expect(await search({ ...files, daterange: 5 })).toHaveLength(8);
    expect(await search({ ...files, daterange: 0 })).toHaveLength(10);
  });

  test("sort modes: modified first and by name", async () => {
    const files = { types: ["public.data"], scopes: ["~/docs"] };
    expect(await search({ ...files, sortmode: 1 })).toEqual([
      "docs/report.pdf",
      "docs/notes.txt",
      "docs/Readme.md",
      "docs/data.csv",
    ]);
    expect(await search({ ...files, sortmode: 2 })).toEqual([
      "docs/data.csv",
      "docs/notes.txt",
      "docs/Readme.md",
      "docs/report.pdf",
    ]);
  });

  test("limit defaults to 50 and is capped at MAX_SCENE_ITEMS", async () => {
    expect(MAX_FILE_RESULTS).toBe(MAX_SCENE_ITEMS);
    expect(await search({ limit: 2, sortmode: 2, types: ["public.data"] })).toEqual([
      "Café report.txt",
      "docs/data.csv",
    ]);
    const many = join(root, "many");
    await mkdir(many);
    try {
      await Promise.all(
        Array.from({ length: 260 }, (_, n) => writeFile(join(many, `f${n}.txt`), "")),
      );
      expect(await search({ scopes: [many] })).toHaveLength(DEFAULT_FILE_LIMIT);
      expect(await search({ scopes: [many], limit: 0 })).toHaveLength(DEFAULT_FILE_LIMIT);
      expect(await search({ scopes: [many], limit: 1000 })).toHaveLength(MAX_SCENE_ITEMS);
    } finally {
      await rm(many, { recursive: true, force: true });
    }
  });

  test("depth and entry caps bound the walk", async () => {
    expect(await search({ query: "report-shot", maxDepth: 1 })).toEqual([]);
    expect(await search({ query: "report-shot", maxDepth: 3 })).toEqual([
      "images/nested/deep/report-shot.png",
    ]);
    // Skipped hidden entries count as looked at, too.
    expect(await search({ maxEntries: 4 })).toEqual(["Apps", "Café report.txt"]);
  });

  test("an aborted signal rejects with AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(searchFilesPortable(options({ signal: controller.signal }))).rejects.toMatchObject(
      {
        name: "AbortError",
      },
    );
  });
});

describe("searchFiles", () => {
  test("off macOS the portable walk answers without mdfind", async () => {
    const found = await searchFiles(
      options({ query: "photo", platform: "linux", runMdfind: never }),
    );
    expect(rel(found)).toEqual(["images/photo.png"]);
  });

  test("on macOS mdfind answers once per scope; vanished paths drop out", async () => {
    const calls: string[][] = [];
    const found = await searchFiles(
      options({
        query: "p",
        platform: "darwin",
        scopes: ["~/docs", "~/images"],
        sortmode: 2,
        runMdfind: async (args) => {
          calls.push(args);
          return args[2]!.endsWith("docs")
            ? [join(root, "docs/report.pdf"), join(root, "docs/gone.pdf")]
            : [join(root, "images/photo.png"), join(root, "docs/report.pdf")];
        },
      }),
    );
    expect(calls).toEqual([
      ["-0", "-onlyin", join(root, "docs"), "kMDItemFSName == '*p*'cd"],
      ["-0", "-onlyin", join(root, "images"), "kMDItemFSName == '*p*'cd"],
    ]);
    expect(rel(found)).toEqual(["images/photo.png", "docs/report.pdf"]);
    expect(found[0]).toMatchObject({ name: "photo.png", isDirectory: false });
  });

  test("a failing mdfind or an empty answer for an existing scope falls back", async () => {
    for (const runMdfind of [failing, empty]) {
      const found = await searchFiles(options({ query: "photo", platform: "darwin", runMdfind }));
      expect(rel(found)).toEqual(["images/photo.png"]);
    }
    expect(
      await searchFiles(
        options({ platform: "darwin", scopes: [join(root, "missing")], runMdfind: empty }),
      ),
    ).toEqual([]);
  });

  test("an abort is not mistaken for an mdfind failure", async () => {
    const controller = new AbortController();
    const runMdfind = async (): Promise<string[]> => {
      controller.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    await expect(
      searchFiles(options({ platform: "darwin", runMdfind, signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
