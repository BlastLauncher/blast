import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// sandbox.ts is browser-typed (tsconfig.browser.json); load it without pulling it into the Node typecheck.
const sandboxModule = "./sandbox.ts";
const { assetUrl } = (await import(sandboxModule)) as {
  assetUrl(options: { assetsUrl?: string }, path: string): string;
};

test("assets default to the package's assets/ directory beside dist/", () => {
  expect(fileURLToPath(assetUrl({}, "esbuild.wasm"))).toBe(
    fileURLToPath(new URL("../assets/esbuild.wasm", import.meta.url)),
  );
});

test("an explicit assetsUrl wins over the packaged default", () => {
  expect(assetUrl({ assetsUrl: "https://cdn.example/blast/" }, "almostnode.mjs")).toBe(
    "https://cdn.example/blast/almostnode.mjs",
  );
});

const { writeSandboxFiles } = (await import(sandboxModule)) as {
  writeSandboxFiles(
    runtime: { execute(code: string, filename?: string): Promise<unknown> },
    files: Array<readonly [string, string | Uint8Array]>,
  ): Promise<void>;
};

test("files reach the sandbox through execute, binary bytes intact", async () => {
  const written = new Map<string, Uint8Array>();
  const directories: string[] = [];
  const fs = {
    mkdirSync: (path: string, options: { recursive?: boolean }) =>
      directories.push(`${path} ${options.recursive}`),
    writeFileSync: (path: string, data: Uint8Array) => written.set(path, new Uint8Array(data)),
  };
  const runs: string[] = [];
  const bytes = new Uint8Array([0x00, 0x7f, 0x80, 0xff]);
  await writeSandboxFiles(
    {
      // The script runs in the sandbox as CommonJS with almostnode's fs and Buffer.
      execute: async (code, filename) => {
        runs.push(filename ?? "");
        new Function("require", "Buffer", "module", code)(() => fs, Buffer, {});
        return {};
      },
    },
    [
      ["/blast/assets/demo/nested/data.json", '{"message":"héllo"}'],
      ["/blast/assets/demo/bytes.bin", bytes],
    ],
  );
  expect(runs).toEqual(["/blast/write-files.cjs"]);
  expect(directories).toEqual(["/blast/assets/demo/nested true", "/blast/assets/demo true"]);
  expect(new TextDecoder().decode(written.get("/blast/assets/demo/nested/data.json"))).toBe(
    '{"message":"héllo"}',
  );
  expect([...written.get("/blast/assets/demo/bytes.bin")!]).toEqual([0, 127, 128, 255]);
});

const { validateFetchProxy } = (await import(sandboxModule)) as {
  validateFetchProxy(value: string | undefined): void;
};
test("proxy requires HTTPS apart from HTTP loopback test servers", () => {
  for (const value of [
    undefined,
    "https://proxy.example/v1",
    "http://127.0.0.1:4321/v1",
    "http://localhost/v1",
  ])
    expect(() => validateFetchProxy(value)).not.toThrow();
  for (const value of [
    "",
    "/v1",
    "http://proxy.example/v1",
    "ftp://proxy.example/v1",
    "https://user:pass@proxy.example/v1",
  ])
    expect(() => validateFetchProxy(value)).toThrow("fetchProxy must be an absolute HTTPS URL");
});

test("prewarm includes proxy identity and installs it before a command", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const directory = await mkdtemp(join(tmpdir(), "blast-proxy-"));
  type Runtime = {
    calls: Array<[string, string]>;
    execute(code: string, filename: string): Promise<void>;
  };
  const { prewarm, acquireSandbox } = (await import(sandboxModule)) as {
    prewarm(options: { sandboxUrl: string; assetsUrl: string; fetchProxy?: string }): void;
    acquireSandbox(options: {
      sandboxUrl: string;
      assetsUrl: string;
      fetchProxy?: string;
    }): Promise<Runtime>;
  };
  try {
    await writeFile(
      join(directory, "almostnode.mjs"),
      `
      export class VirtualFS {}
      export async function createRuntime() {
        return { calls: [], async execute(code, filename) { this.calls.push([code, filename]); } };
      }
    `,
    );
    const options = {
      sandboxUrl: "https://sandbox.example/",
      assetsUrl: pathToFileURL(`${directory}/`).href,
      fetchProxy: "https://proxy.example/v1",
    };
    prewarm(options);
    const warm = await acquireSandbox(options);
    expect(warm.calls[0]?.[1]).toBe("/blast/fetch-proxy.cjs");
    expect(warm.calls[0]?.[0]).toContain(JSON.stringify(options.fetchProxy));
    await warm.execute("command", "command.cjs");
    expect(warm.calls.map((call) => call[1])).toEqual(["/blast/fetch-proxy.cjs", "command.cjs"]);
    prewarm(options);
    const direct = await acquireSandbox({
      sandboxUrl: options.sandboxUrl,
      assetsUrl: options.assetsUrl,
    });
    expect(direct.calls).toEqual([]);
    // A different key left the original warm sandbox available.
    const adopted = await acquireSandbox(options);
    expect(adopted.calls[0]?.[1]).toBe("/blast/fetch-proxy.cjs");
    expect(adopted).not.toBe(warm);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
