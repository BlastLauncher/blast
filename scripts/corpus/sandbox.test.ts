import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSandboxed, sandboxAvailable, sweepEnvironment } from "./sandbox.ts";

test("sweep environment contains only the allowlist and points user paths at scratch", () => {
  const env = sweepEnvironment("/private/tmp/blast-scratch", {
    PATH: "/bin",
    SECRET_TOKEN: "should-not-copy",
    HOME: "/Users/secret",
  });
  expect(env.SECRET_TOKEN).toBeUndefined();
  expect(env.HOME).toBe("/private/tmp/blast-scratch");
  expect(env.XDG_CONFIG_HOME).toBe("/private/tmp/blast-scratch/config");
  expect(Object.keys(env).toSorted()).toEqual([
    "HOME",
    "LANG",
    "LC_ALL",
    "PATH",
    "TEMP",
    "TMP",
    "TMPDIR",
    "TZ",
    "USER",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
  ]);
});

test.skipIf(!sandboxAvailable())(
  "sandbox denies reads, network and writes outside scratch",
  async () => {
    const root = process.cwd();
    const base = mkdtempSync(join(tmpdir(), "blast-sandbox-fixture-"));
    const scratch = mkdtempSync(join(base, "scratch-"));
    const deniedDir = mkdtempSync(join(tmpdir(), "blast-denied-"));
    const denied = join(deniedDir, "secret");
    const outside = join(deniedDir, "outside");
    writeFileSync(denied, "planted secret");
    mkdirSync(join(root, ".cache"), { recursive: true });
    const result = await runSandboxed({
      script: join(root, "fixtures/sandbox/probe.js"),
      args: [denied, outside, scratch],
      scratch,
      root,
      bun: process.execPath,
      deniedPaths: [deniedDir],
    });
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload.deniedRead).not.toBe("allowed");
    expect(payload.network).not.toBe("connected");
    expect(payload.outsideWrite).not.toBe("allowed");
    expect(payload.scratchWrite).toBe("allowed");
    expect(existsSync(outside)).toBe(false);
    expect(readFileSync(join(scratch, "inside"), "utf8")).toBe("inside");
    expect(payload.env).toEqual([
      "HOME",
      "LANG",
      "LC_ALL",
      "PATH",
      "TEMP",
      "TMP",
      "TMPDIR",
      "TZ",
      "USER",
      "XDG_CACHE_HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
    ]);
  },
);
