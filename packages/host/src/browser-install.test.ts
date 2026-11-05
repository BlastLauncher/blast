import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  BrowserIntegrityError,
  BrowserNativeModuleError,
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
