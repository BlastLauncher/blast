import { expect, test } from "bun:test";
import {
  assetRelativePath,
  commandEntry,
  extensionAssets,
  fetchExtensionFiles,
  manifestCommands,
  resolveExtensionSource,
  sandboxFiles,
} from "./extension-files.ts";

const fixture = new Map<string, string>([
  ["package.json", JSON.stringify({ name: "demo", commands: [{ name: "a" }, { name: "b" }, {}] })],
  ["src/a.tsx", "export default 1"],
]);
const fixtureFetch = async (input: string) => {
  const match = /\/demo\/(.+)$/.exec(input);
  if (match?.[1] === "__files") return Response.json([...fixture.keys()]);
  const body = match ? fixture.get(match[1]!) : undefined;
  return body === undefined ? new Response("", { status: 404 }) : new Response(body);
};

test("raycast/extensions/<name> is the shorthand for a Store extension", () => {
  expect(resolveExtensionSource("raycast/extensions/demo")).toBe("demo");
  expect(resolveExtensionSource(" raycast/extensions/demo ")).toBe("demo");
  expect(resolveExtensionSource("https://github.com/o/r/tree/main/x")).toBe(
    "https://github.com/o/r/tree/main/x",
  );
});

test("fixtures stand in for GitHub only when a fixtures URL is given", async () => {
  const extension = await fetchExtensionFiles("raycast/extensions/demo", {
    fetch: fixtureFetch,
    fixturesUrl: "http://127.0.0.1/fixtures/",
  });
  expect([...extension.files.keys()].toSorted()).toEqual(["/package.json", "/src/a.tsx"]);
  expect(extension.root).toBe("demo");
  expect(manifestCommands(extension.manifest)).toEqual(["a", "b"]);
});

test("without fixtures the files come from GitHub and a rate limit is reported", async () => {
  const urls: string[] = [];
  await expect(
    fetchExtensionFiles("demo", {
      fetch: async (input) => {
        urls.push(input);
        return new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
      },
    }),
  ).rejects.toThrow("rate limit");
  expect(urls[0]).toStartWith("https://api.github.com/repos/raycast/extensions/contents/");
});

test("a command entry prefers its own file and falls back to src/index.tsx", () => {
  const files = new Map([
    ["/src/a.tsx", ""],
    ["/src/index.tsx", ""],
  ]);
  expect(commandEntry(files, "a")).toBe("/src/a.tsx");
  expect(commandEntry(files, "b")).toBe("/src/index.tsx");
  expect(() => commandEntry(new Map(), "b")).toThrow("Command source not found for b");
});

test("assets, src data files and package.json map under the assets directory; code does not", () => {
  expect(assetRelativePath("/assets/dataset.json")).toBe("dataset.json");
  expect(assetRelativePath("/assets/symbols/data.json")).toBe("symbols/data.json");
  expect(assetRelativePath("/src/api/stations.json")).toBe("api/stations.json");
  expect(assetRelativePath("/package.json")).toBe("package.json");
  expect(assetRelativePath("/src/index.tsx")).toBeUndefined();
  expect(assetRelativePath("/x/node_modules/y.json")).toBeUndefined();
});

test("sandbox files keep bytes, put package.json one level up and create both directories", () => {
  const bytes = new Uint8Array([0x89, 0x50, 0xff]);
  const assets = extensionAssets(
    new Map<string, string | Uint8Array>([
      ["/package.json", '{"name":"demo"}'],
      ["/assets/icon.png", bytes],
      ["/src/index.tsx", "export default 1"],
    ]),
  );
  // Prebuilt bundles list the same asset-relative keys, so both launch paths agree.
  expect(assets).toEqual([
    ["package.json", '{"name":"demo"}'],
    ["icon.png", bytes],
  ]);
  const files = sandboxFiles(assets, "/blast/assets/demo", "/blast/support/demo");
  expect(files).toEqual([
    ["/blast/support/demo/.keep", ""],
    ["/blast/assets/demo/.keep", ""],
    ["/blast/assets/demo/package.json", '{"name":"demo"}'],
    ["/blast/assets/package.json", '{"name":"demo"}'],
    ["/blast/assets/demo/icon.png", bytes],
  ]);
  expect(files[4]![1]).toBe(bytes);
});
