import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXTRACTED_MARKER, extractWorkflowArchive, readZipEntries } from "./archive.ts";
import { zip } from "./workflow-test-helper.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

let scratch: string | undefined;
afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

async function setup(bytes: Uint8Array): Promise<{ archive: string; cache: string }> {
  scratch = await mkdtemp(join(tmpdir(), "blast-alfred-"));
  const archive = join(scratch, "test.alfredworkflow");
  await writeFile(archive, bytes);
  return { archive, cache: join(scratch, "cache") };
}

describe("readZipEntries", () => {
  test("reads stored and deflated entries behind an archive comment", () => {
    const repeated = "deflate me ".repeat(200);
    const entries = readZipEntries(
      zip(
        [
          { name: "info.plist", data: "<plist/>" },
          { name: "src/", mode: 0o040755 },
          { name: "src/run.sh", data: repeated, method: 8, mode: 0o100755 },
        ],
        "made by a test",
      ),
    );
    expect(entries.map((e) => [e.name, e.isDirectory, e.method, e.mode])).toEqual([
      ["info.plist", false, 0, 0o644],
      ["src/", true, 0, 0o755],
      ["src/run.sh", false, 8, 0o755],
    ]);
    expect(text(entries[0]!.read())).toBe("<plist/>");
    expect(entries[2]!.compressedSize).toBeLessThan(entries[2]!.size);
    expect(text(entries[2]!.read())).toBe(repeated);
  });

  test("ignores mode bits from non-Unix hosts", () => {
    const [entry] = readZipEntries(zip([{ name: "a.txt", data: "a", madeBy: 0, mode: 0o100755 }]));
    expect(entry?.mode).toBe(0);
  });

  test("rejects a CRC-32 mismatch when reading", () => {
    const [entry] = readZipEntries(zip([{ name: "a.txt", data: "abc", crc: 1234 }]));
    expect(() => entry!.read()).toThrow(/CRC-32 mismatch for "a.txt"/);
  });

  test("rejects deflated data larger than its declared size", () => {
    const [entry] = readZipEntries(
      zip([{ name: "bomb", data: new Uint8Array(1 << 20), method: 8, size: 10 }]),
    );
    expect(() => entry!.read()).toThrow(/cannot inflate "bomb"/);
  });

  test.each([
    ["../evil.sh", /escapes the archive root/],
    ["a/../../evil.sh", /escapes the archive root/],
    ["/etc/passwd", /is absolute/],
    ["a\\..\\evil", /backslash/],
    ["C:/evil", /drive prefix/],
    ["a\0b", /NUL byte/],
    ["a//b", /empty or "." segment/],
    ["a/./b", /empty or "." segment/],
    [".", /empty or "." segment/],
  ])("rejects the unsafe name %j", (name, message) => {
    expect(() => readZipEntries(zip([{ name, data: "x" }]))).toThrow(message);
  });

  test("normalizes leading ./ prefixes and skips bare ./ root directory entries", () => {
    const entries = readZipEntries(
      zip([
        { name: "./", mode: 0o040755 },
        { name: "./info.plist", data: "<plist/>" },
        { name: "./sub/run.sh", data: "#!/bin/sh", mode: 0o100755 },
      ]),
    );
    expect(entries.map((e) => e.name)).toEqual(["info.plist", "sub/run.sh"]);
    expect(text(entries[0]!.read())).toBe("<plist/>");
    expect(() => readZipEntries(zip([{ name: "./info.plist" }, { name: "info.plist" }]))).toThrow(
      /duplicate entry "info.plist"/,
    );
  });

  test.each([
    ["a symlink", { name: "link", data: "/etc/passwd", mode: 0o120777 }, /symbolic link/],
    [
      "a symlink from a DOS host",
      { name: "link", data: "/etc", mode: 0o120777, madeBy: 0 },
      /symbolic link/,
    ],
    ["an encrypted entry", { name: "secret", data: "x", flags: 1 }, /is encrypted/],
    [
      "an unsupported method",
      { name: "lzma", data: "x", method: 14 },
      /unsupported compression method 14/,
    ],
  ])("rejects %s", (_name, spec, message) => {
    expect(() => readZipEntries(zip([spec]))).toThrow(message);
  });

  test("rejects duplicate names and non-ZIP input", () => {
    expect(() => readZipEntries(zip([{ name: "a" }, { name: "a" }]))).toThrow(
      /duplicate entry "a"/,
    );
    expect(() =>
      readZipEntries(new TextEncoder().encode("definitely not a zip archive at all")),
    ).toThrow(/end of central directory not found/);
  });
});

describe("extractWorkflowArchive", () => {
  test("extracts files, keeps executable bits and skips __MACOSX", async () => {
    const { archive, cache } = await setup(
      zip([
        { name: "info.plist", data: "<plist/>", mode: 0o100644 },
        { name: "bin/run.sh", data: "#!/bin/sh\necho hi\n", method: 8, mode: 0o104755 },
        { name: "__MACOSX/._info.plist", data: "fork" },
      ]),
    );
    const result = await extractWorkflowArchive(archive, cache);
    expect(result.extracted).toBe(true);
    expect(result.dir).toMatch(/[\\/]cache[\\/][0-9a-f]{16}$/);
    expect(await readFile(join(result.dir, "info.plist"), "utf8")).toBe("<plist/>");
    const script = await stat(join(result.dir, "bin/run.sh"));
    expect(script.mode & 0o7777).toBe(0o755);
    expect((await stat(join(result.dir, "info.plist"))).mode & 0o111).toBe(0);
    expect((await readdir(result.dir)).toSorted()).toEqual([EXTRACTED_MARKER, "bin", "info.plist"]);
    expect(await readdir(cache)).toEqual([result.dir.split(/[\\/]/).at(-1)!]);
  });

  test("returns the cached directory without rewriting it", async () => {
    const { archive, cache } = await setup(zip([{ name: "info.plist", data: "original" }]));
    const first = await extractWorkflowArchive(archive, cache);
    await writeFile(join(first.dir, "info.plist"), "edited after extraction");
    const second = await extractWorkflowArchive(archive, cache);
    expect(second).toEqual({ dir: first.dir, extracted: false });
    expect(await readFile(join(first.dir, "info.plist"), "utf8")).toBe("edited after extraction");
  });

  test("concurrent extractions converge on one directory", async () => {
    const { archive, cache } = await setup(zip([{ name: "info.plist", data: "x" }]));
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => extractWorkflowArchive(archive, cache)),
    );
    expect(new Set(results.map((r) => r.dir)).size).toBe(1);
    expect(results.filter((r) => r.extracted)).toHaveLength(1);
    expect(await readdir(cache)).toHaveLength(1);
  });

  test("replaces a leftover directory that has no completion marker", async () => {
    const { archive, cache } = await setup(zip([{ name: "info.plist", data: "fresh" }]));
    const { dir } = await extractWorkflowArchive(archive, cache);
    await rm(join(dir, EXTRACTED_MARKER));
    await writeFile(join(dir, "partial"), "");
    const again = await extractWorkflowArchive(archive, cache);
    expect(again.extracted).toBe(true);
    expect((await readdir(dir)).toSorted()).toEqual([EXTRACTED_MARKER, "info.plist"]);
  });

  test.each([
    ["total size", { maxTotalBytes: 100 }, /expands past the 100-byte limit/],
    ["entry count", { maxEntries: 2 }, /3 entries, limit is 2/],
  ])("enforces the %s limit and leaves nothing behind", async (_name, options, message) => {
    const { archive, cache } = await setup(
      zip([
        { name: "a", data: new Uint8Array(60), method: 8 },
        { name: "b", data: new Uint8Array(60), method: 8 },
        { name: "c", data: "" },
      ]),
    );
    await expect(extractWorkflowArchive(archive, cache, options)).rejects.toThrow(message);
    await mkdir(cache, { recursive: true });
    expect(await readdir(cache)).toEqual([]);
  });

  test("cleans up the temporary directory when an entry is corrupt", async () => {
    const { archive, cache } = await setup(
      zip([
        { name: "good", data: "fine" },
        { name: "bad", data: "abc", crc: 7 },
      ]),
    );
    await expect(extractWorkflowArchive(archive, cache)).rejects.toThrow(/CRC-32 mismatch/);
    expect(await readdir(cache)).toEqual([]);
  });

  test("rejects entries that would collide with the completion marker", async () => {
    const { archive, cache } = await setup(zip([{ name: `${EXTRACTED_MARKER}/x`, data: "" }]));
    await expect(extractWorkflowArchive(archive, cache)).rejects.toThrow(
      /collides with the extraction marker/,
    );
  });
});
