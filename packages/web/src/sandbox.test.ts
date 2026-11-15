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
