import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  loadBundleIndex,
  loadPrebuiltCommand,
  loadPrebuiltRuntime,
  storeExtensionName,
} from "./prebuilt.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const entry = (path: string, body: string | Uint8Array) => {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    path,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};
const SOURCE = "https://github.com/raycast/extensions/tree/abc/extensions/demo";

/** Serves `files` under `base`; every request is recorded. */
function serve(base: string, files: Record<string, string | Uint8Array | object>) {
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    requests.push(url);
    const body = files[url.slice(base.length)];
    if (body === undefined) return new Response("missing", { status: 404 });
    return typeof body === "string" || body instanceof Uint8Array
      ? new Response(body)
      : Response.json(body);
  }) as typeof fetch;
  return requests;
}

/** A deployment with one prebuilt command, a text and a binary asset, and the shared runtime. */
function deployment(base: string, overrides: { code?: string; buildSha?: string } = {}) {
  const icon = new Uint8Array([137, 80, 78, 71]);
  const index = {
    buildSha: "build-1",
    runtime: entry("bundles/runtime.js", "runtime();"),
    bundles: {
      "demo/index": {
        ...entry("bundles/demo/index.js", "command();"),
        files: {
          "assets/data.json": entry("bundles/demo/data.json", '{"a":1}'),
          "assets/icon.png": entry("bundles/demo/icon.png", icon),
        },
        manifest: {
          name: "demo",
          preferences: [],
          commands: { index: [] },
          modes: { index: "no-view" },
        },
      },
    },
  };
  return serve(base, {
    "bundles.json": index,
    "build.json": { sha: overrides.buildSha ?? "build-1" },
    "bundles/runtime.js": "runtime();",
    "bundles/demo/index.js": overrides.code ?? "command();",
    "bundles/demo/data.json": '{"a":1}',
    "bundles/demo/icon.png": icon,
  });
}

test("prebuilt bundles are keyed by raycast/extensions store names only", () => {
  expect(storeExtensionName("raycast/extensions/demo")).toBe("demo");
  expect(storeExtensionName(SOURCE)).toBe("demo");
  expect(
    storeExtensionName("https://github.com/someone/extensions/tree/main/extensions/demo"),
  ).toBe(undefined);
  expect(storeExtensionName("https://github.com/raycast/extensions/tree/main/extensions/a/b")).toBe(
    undefined,
  );
  expect(storeExtensionName("demo")).toBe("demo");
  expect(storeExtensionName("http://github.com/raycast/extensions")).toBe(undefined);
});

test("a verified prebuilt command carries its manifest and decoded files", async () => {
  const base = "https://site.test/one/";
  deployment(base);
  const location = { bundlesUrl: `${base}bundles.json`, buildUrl: `${base}build.json` };
  const built = await loadPrebuiltCommand(location, SOURCE, "index");
  expect(built?.code).toBe("command();");
  expect(built?.manifest.modes).toEqual({ index: "no-view" });
  expect(built?.files.get("/assets/data.json")).toBe('{"a":1}');
  expect(built?.files.get("/assets/icon.png")).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(await loadPrebuiltRuntime(location)).toBe("runtime();");
  expect(await loadPrebuiltCommand(location, SOURCE, "other")).toBe(undefined);
});

test("a bundle whose bytes do not match the index is not used", async () => {
  const base = "https://site.test/two/";
  deployment(base, { code: "tampered();" });
  expect(await loadPrebuiltCommand({ bundlesUrl: `${base}bundles.json` }, SOURCE, "index")).toBe(
    undefined,
  );
});

test("an index from another build is ignored, and a missing one is fetched again", async () => {
  const base = "https://site.test/three/";
  deployment(base, { buildSha: "build-2" });
  const location = { bundlesUrl: `${base}bundles.json`, buildUrl: `${base}build.json` };
  expect(await loadBundleIndex(location)).toBe(undefined);
  const requests = serve(base, {});
  expect(await loadBundleIndex(location)).toBe(undefined);
  expect(requests).toContain(`${base}bundles.json`);
});
