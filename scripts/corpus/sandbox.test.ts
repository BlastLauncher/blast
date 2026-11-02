import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve as resolvePath } from "node:path";
import { runSandboxed, sandboxAvailable, sandboxProfile, sweepEnvironment } from "./sandbox.ts";

async function removeTemp(path: string): Promise<void> {
  const root = resolvePath(tmpdir());
  const target = resolvePath(path);
  const remainder = relative(root, target);
  if (!remainder || remainder.startsWith("..") || remainder.startsWith("/"))
    throw new Error(`refusing to remove path outside temporary directory: ${path}`);
  await rm(target, { recursive: true, force: true });
}

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

test("sandbox profile does not grant host credential or app services", () => {
  const profile = sandboxProfile(
    [process.cwd()],
    join(tmpdir(), "blast-profile-test"),
    [],
    "/home/test",
    ["/usr/bin/true"],
  );
  for (const service of [
    "com.apple.securityd",
    "com.apple.pasteboard",
    "com.apple.LaunchServices",
    "com.apple.appleeventsd",
  ])
    expect(profile).not.toContain(service);
  expect(profile).toContain("(deny network*)");
});

async function fixture(
  args: string[],
  scratch: string,
  options: { home?: string; unsandboxed?: boolean; deniedPaths?: string[] } = {},
): Promise<Record<string, unknown>> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("listener did not get a port");
  const result = await runSandboxed({
    script: join(process.cwd(), "fixtures/sandbox/probe.js"),
    args: [...args, String(address.port)],
    scratch,
    root: process.cwd(),
    bun: process.execPath,
    ...options,
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (result.code !== 0) throw new Error(`fixture failed: ${result.stderr}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

test.skipIf(!sandboxAvailable())(
  "sandbox containment differs from an unsandboxed child for reads, local network and writes",
  async () => {
    const root = process.cwd();
    const base = mkdtempSync(join(tmpdir(), "blast-sandbox-fixture-"));
    const scratch = mkdtempSync(join(base, "scratch-"));
    const fakeHome = mkdtempSync(join(base, "home-"));
    const deniedDir = mkdtempSync(join(tmpdir(), "blast-denied-"));
    const denied = join(fakeHome, "secret");
    const outside = join(deniedDir, "outside");
    writeFileSync(denied, "planted secret");
    mkdirSync(join(root, ".cache"), { recursive: true });
    const sandboxed = await fixture([denied, outside, scratch], scratch, {
      home: fakeHome,
      deniedPaths: [deniedDir],
    });
    const unsandboxed = await fixture([denied, outside, scratch], scratch, {
      home: fakeHome,
      unsandboxed: true,
    });
    expect(sandboxed.deniedRead).not.toBe("planted secret");
    expect(unsandboxed.deniedRead).toBe("allowed");
    expect(sandboxed.network).not.toBe("connected");
    expect(unsandboxed.network).toBe("connected");
    expect(sandboxed.outsideWrite).not.toBe("allowed");
    expect(unsandboxed.outsideWrite).toBe("allowed");
    expect(sandboxed.scratchWrite).toBe("allowed");
    expect(sandboxed.devNullWrite).toBe("allowed");
    expect(existsSync(outside)).toBe(true);
    expect(readFileSync(join(scratch, "inside"), "utf8")).toBe("inside");
    expect(sandboxed.exec).not.toBe("exit:0");
    expect(unsandboxed.exec).toBe("exit:0");
    expect(sandboxed.env).toEqual([
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
    await removeTemp(base);
    await removeTemp(deniedDir);
  },
);

test.skipIf(!sandboxAvailable())(
  "the home deny covers a newly planted non-allowlisted path",
  async () => {
    const base = mkdtempSync(join(tmpdir(), "blast-sandbox-home-"));
    const fakeHome = mkdtempSync(join(base, "home-"));
    const secret = join(fakeHome, "secret");
    const scratch = mkdtempSync(join(tmpdir(), "blast-sandbox-scratch-"));
    writeFileSync(secret, "real home secret");
    const sandboxed = await fixture([secret, join(tmpdir(), "unused"), scratch], scratch, {
      home: fakeHome,
    });
    const unsandboxed = await fixture([secret, join(tmpdir(), "unused"), scratch], scratch, {
      home: fakeHome,
      unsandboxed: true,
    });
    expect(sandboxed.deniedRead).not.toBe("allowed");
    expect(unsandboxed.deniedRead).toBe("allowed");
    await removeTemp(base);
    await removeTemp(scratch);
  },
);
