import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prebuildCatalog } from "./prebuild.ts";
import type { Catalog } from "./root.ts";

const encoder = new TextEncoder();

type PackageVersions = Record<
  string,
  { dependencies?: Record<string, string>; files: Record<string, string> }
>;

function tarEntry(name: string, contents: Uint8Array): Uint8Array {
  const block = new Uint8Array(512);
  const put = (value: string, offset: number) => block.set(encoder.encode(value), offset);
  put(name, 0);
  put("0000644\0", 100);
  put("0000000\0", 108);
  put("0000000\0", 116);
  put(`${contents.byteLength.toString(8).padStart(11, "0")}\0`, 124);
  put("00000000000\0", 136);
  block.fill(32, 148, 156);
  block[156] = 48;
  put("ustar\0", 257);
  put("00", 263);
  let checksum = 0;
  for (const byte of block) checksum += byte;
  put(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
  return block;
}

function tar(files: Record<string, string>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [path, contents] of Object.entries(files)) {
    const bytes = encoder.encode(contents);
    parts.push(tarEntry(`package/${path}`, bytes), bytes);
    const padding = (512 - (bytes.byteLength % 512)) % 512;
    if (padding) parts.push(new Uint8Array(padding));
  }
  parts.push(new Uint8Array(1024));
  const archive = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    archive.set(part, offset);
    offset += part.byteLength;
  }
  return archive;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// An offline registry whose layout matches fixtures/extensions/nested-versions
// package-lock.json: `first` needs conflict@1 nested under itself, `second`
// shares the root conflict@2.
const graph: Record<string, PackageVersions> = {
  first: {
    "1.0.0": {
      dependencies: { conflict: "1.0.0" },
      files: { "index.js": 'module.exports = "first:" + require("conflict");' },
    },
  },
  second: {
    "1.0.0": {
      dependencies: { conflict: "2.0.0" },
      files: { "index.js": 'module.exports = "second:" + require("conflict");' },
    },
  },
  conflict: {
    "1.0.0": { files: { "index.js": 'module.exports = "one";' } },
    "2.0.0": { files: { "index.js": 'module.exports = "two";' } },
  },
};

const archives = new Map<string, Promise<Uint8Array>>();
function tarball(name: string, version: string): Promise<Uint8Array> {
  const key = `${name}@${version}`;
  let pending = archives.get(key);
  if (!pending) {
    const metadata = graph[name]?.[version];
    if (!metadata) throw new Error(`missing fixture ${key}`);
    pending = gzip(
      tar({
        "package.json": JSON.stringify({ name, version, main: "index.js" }),
        ...metadata.files,
      }),
    );
    archives.set(key, pending);
  }
  return pending;
}

async function registryFetch(input: string): Promise<Response> {
  const url = new URL(input);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "tarballs")
    return new Response(
      await tarball(decodeURIComponent(parts[1]!), parts[2]!.replace(/\.tgz$/, "")),
    );
  const name = decodeURIComponent(parts.join("/"));
  const versions = graph[name];
  if (!versions) return new Response(null, { status: 404 });
  return Response.json({
    versions: Object.fromEntries(
      Object.entries(versions).map(([version, metadata]) => [
        version,
        {
          dependencies: metadata.dependencies,
          dist: {
            tarball: `https://registry.test/tarballs/${encodeURIComponent(name)}/${version}.tgz`,
          },
        },
      ]),
    ),
  });
}

test("prebuilds a fixture whose lockfile nests conflicting versions", async () => {
  const output = await mkdtemp(join(tmpdir(), "blast-prebuild-"));
  try {
    const catalog: Catalog = {
      commit: "fixture",
      extensions: [
        {
          name: "nested-versions",
          title: "Nested Versions",
          commands: [{ name: "index", title: "Nested Versions", mode: "view" }],
        },
      ],
    };
    const result = await prebuildCatalog(catalog, "test-sha", output, true, {
      fetch: registryFetch,
    });
    expect(result.reasons).toEqual([]);
    expect(result.built).toBe(1);
    const code = await readFile(join(output, "bundles/nested-versions/index.js"), "utf8");
    // Both copies made it into the bundle: the nested one for `first`, the root
    // one for `second`.
    expect(code).toContain('"first:"');
    expect(code).toContain('"second:"');
    expect(code).toContain('"one"');
    expect(code).toContain('"two"');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
