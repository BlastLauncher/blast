import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  BrowserIntegrityError,
  BrowserNativeModuleError,
  BrowserTarPathError,
  BrowserSizeLimitError,
  installForBrowser,
  unpackTar,
} from "./browser-install.ts";

const fixtureRoot = join(import.meta.dir, "../../../fixtures/npm");

async function fixtureFetch(input: string): Promise<Response> {
  const name = input.split("/").at(-1) ?? "";
  if (input.includes("registry.test")) {
    const path = join(
      fixtureRoot,
      name === "demo.tgz"
        ? "demo-1.2.0.tgz"
        : name === "nested.tgz"
          ? "nested-1.1.0.tgz"
          : name === "peer.tgz"
            ? "peer-1.0.0.tgz"
            : "native-1.0.0.tgz",
    );
    return new Response(await readFile(path));
  }
  const packument =
    name === "demo"
      ? "demo.json"
      : name === "nested"
        ? "nested.json"
        : name === "peer"
          ? "peer.json"
          : "native.json";
  return new Response(await readFile(join(fixtureRoot, packument)), {
    headers: { "content-type": "application/json" },
  });
}

test("resolves ranges, skips supplied and dev dependencies, and deduplicates nested packages", async () => {
  const result = await installForBrowser({
    fetch: fixtureFetch,
    manifest: {
      dependencies: { demo: "^1", react: "^19", "@raycast/api": "^2" },
      devDependencies: { ignored: "^1" },
    },
  });
  expect(result.versions).toEqual(
    new Map([
      ["demo", "1.2.0"],
      ["nested", "1.1.0"],
      ["peer", "1.0.0"],
    ]),
  );
  expect([...result.packages.keys()].filter((path) => path.endsWith("package.json"))).toHaveLength(
    3,
  );
});

test("lockfile pins a version even when the range would choose another release", async () => {
  const result = await installForBrowser({
    fetch: fixtureFetch,
    manifest: { dependencies: { demo: "~1.2.0" } },
    lockfile: { packages: { "node_modules/demo": { version: "1.2.0" } } },
  });
  expect(result.versions.get("demo")).toBe("1.2.0");
});

test("integrity and byte caps are typed errors", async () => {
  await expect(
    installForBrowser({
      fetch: fixtureFetch,
      manifest: { dependencies: { demo: "^1" } },
      maxBytes: 1,
    }),
  ).rejects.toBeInstanceOf(BrowserSizeLimitError);
  const badFetch = async (input: string): Promise<Response> => {
    const response = await fixtureFetch(input);
    if (!input.includes("registry.test")) return response;
    const bytes = new Uint8Array(await response.arrayBuffer());
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    return new Response(bytes);
  };
  await expect(
    installForBrowser({ fetch: badFetch, manifest: { dependencies: { demo: "^1" } } }),
  ).rejects.toBeInstanceOf(BrowserIntegrityError);
});

test("tar parser handles ustar prefixes, directories, and files", () => {
  const archive = new Uint8Array(2048);
  const header = archive.subarray(0, 512);
  const name = "file.txt";
  const prefix = "a/very/long/prefix";
  header.set(new TextEncoder().encode(name), 0);
  header.set(new TextEncoder().encode("0000644\0"), 100);
  header.set(new TextEncoder().encode("00000000003\0"), 124);
  header[156] = 0;
  header.set(new TextEncoder().encode(prefix), 345);
  archive.set(new TextEncoder().encode("hey"), 512);
  const parsed = unpackTar(archive);
  expect(new TextDecoder().decode(parsed.get(`${prefix}/${name}`)!)).toBe("hey");
});

test("browser installer rejects native archives and has no node filesystem imports", async () => {
  const source = await readFile(join(import.meta.dir, "browser-install.ts"), "utf8");
  expect(source).not.toContain("node:fs");
  expect(source).not.toContain("node:child_process");
  expect(BrowserNativeModuleError).toBeDefined();
  await expect(
    installForBrowser({ fetch: fixtureFetch, manifest: { dependencies: { native: "1" } } }),
  ).rejects.toBeInstanceOf(BrowserNativeModuleError);
});

test("installs @raycast/utils and chooses highest matching major", async () => {
  const tarball = await readFile(join(fixtureRoot, "nested-1.1.0.tgz"));
  const fetch = async (input: string): Promise<Response> => {
    if (input.endsWith("/utils"))
      return new Response(
        JSON.stringify({ versions: { "1.0.0": { dist: { tarball: "utils.tgz" } } } }),
      );
    if (input.endsWith("/major"))
      return new Response(
        JSON.stringify({
          versions: {
            "4.1.0": { dist: { tarball: "major4.tgz" } },
            "5.0.0": { dist: { tarball: "major5.tgz" } },
          },
        }),
      );
    return new Response(tarball);
  };
  const result = await installForBrowser({
    registry: "https://registry.test",
    fetch,
    manifest: { dependencies: { "@raycast/utils": "^1", major: "^4" } },
  });
  expect(result.versions.get("@raycast/utils")).toBe("1.0.0");
  expect(result.versions.get("major")).toBe("4.1.0");
});

test("sends abbreviated packument accept header", async () => {
  let header: string | null = null;
  await installForBrowser({
    fetch: async (input, init) => {
      if (input.endsWith("/demo")) {
        header = new Headers(init?.headers).get("accept");
        return fixtureFetch(input);
      }
      return fixtureFetch(input);
    },
    manifest: { dependencies: { demo: "1.2.0" } },
  });
  expect(String(header)).toBe("application/vnd.npm.install-v1+json");
});

test("rejects unsafe tar paths and ignores links", () => {
  const archive = new Uint8Array(2048);
  const header = archive.subarray(0, 512);
  header.set(new TextEncoder().encode("package/../../react/index.js"), 0);
  header.set(new TextEncoder().encode("00000000001\0"), 124);
  header[156] = 0;
  expect(() => unpackTar(archive)).toThrow(BrowserTarPathError);
  const link = new Uint8Array(1024);
  link.set(new TextEncoder().encode("package/link"), 0);
  link.set(new TextEncoder().encode("00000000000\0"), 124);
  link[156] = 49;
  expect(unpackTar(link)).toHaveLength(0);
});

test("handles pax long paths, cycles, and nested conflicting versions", async () => {
  const tarball = await readFile(join(fixtureRoot, "nested-1.1.0.tgz"));
  const graph: Record<string, Record<string, { dependencies?: Record<string, string> }>> = {
    cycleA: { "1.0.0": { dependencies: { cycleB: "1" } } },
    cycleB: { "1.0.0": { dependencies: { cycleA: "1" } } },
    first: { "1.0.0": { dependencies: { conflict: "1" } } },
    second: { "1.0.0": { dependencies: { conflict: "2" } } },
    conflict: { "1.0.0": {}, "2.0.0": {} },
  };
  const fetch = async (input: string): Promise<Response> => {
    const name = input.split("/").at(-1)!;
    if (name.endsWith(".tgz")) return new Response(tarball);
    const versions = graph[name];
    if (!versions) return new Response(null, { status: 404 });
    return new Response(
      JSON.stringify({
        versions: Object.fromEntries(
          Object.entries(versions).map(([version, metadata]) => [
            version,
            { ...metadata, dist: { tarball: `${name}-${version}.tgz` } },
          ]),
        ),
      }),
    );
  };
  const cycle = await installForBrowser({ fetch, manifest: { dependencies: { cycleA: "1" } } });
  expect(cycle.versions.get("cycleA")).toBe("1.0.0");
  const conflict = await installForBrowser({
    fetch,
    manifest: { dependencies: { first: "1", second: "1" } },
  });
  expect(
    [...conflict.packages.keys()].some((path) =>
      path.includes("node_modules/conflict/node_modules"),
    ),
  ).toBe(false);
  expect(
    [...conflict.packages.keys()].some(
      (path) =>
        path.includes("node_modules/first/node_modules/conflict") ||
        path.includes("node_modules/second/node_modules/conflict"),
    ),
  ).toBe(true);
});

test("reads pax path records", () => {
  const longPath = `package/${"x".repeat(120)}.js`;
  const record = `${String(longPath.length + 12).padStart(5, "0")} path=${longPath}\n`;
  const archive = new Uint8Array(3072);
  const pax = archive.subarray(0, 512);
  pax.set(new TextEncoder().encode("PaxHeader"), 0);
  pax.set(new TextEncoder().encode(record.length.toString(8).padStart(11, "0") + "\0"), 124);
  pax[156] = 120;
  archive.set(new TextEncoder().encode(record), 512);
  const file = archive.subarray(1024, 1536);
  file.set(new TextEncoder().encode("package/file"), 0);
  file.set(new TextEncoder().encode("00000000003\0"), 124);
  archive.set(new TextEncoder().encode("hey"), 1536);
  expect([...unpackTar(archive).keys()]).toContain(longPath);
});

test("accepts SRI values containing a sha512 hash among other hashes", async () => {
  // Keep the fixture mutation local to this test.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const fetch = async (input: string): Promise<Response> => {
    if (input.endsWith("/demo")) {
      const response = await fixtureFetch(input);
      const packument = (await response.json()) as {
        versions: Record<string, { dist: { integrity: string } }>;
      };
      packument.versions["1.2.0"]!.dist.integrity =
        `sha1-not-used ${packument.versions["1.2.0"]!.dist.integrity}`;
      return new Response(JSON.stringify(packument));
    }
    return fixtureFetch(input);
  };
  await expect(
    installForBrowser({ fetch, manifest: { dependencies: { demo: "1" } } }),
  ).resolves.toBeDefined();
});
