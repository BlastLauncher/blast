import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireVerifyLock, resolveVerifyLimits } from "./verify.ts";

test("resolveVerifyLimits derives bounded concurrency from host CPU count", () => {
  expect(resolveVerifyLimits(2, {})).toEqual({
    jobs: 1,
    staticConcurrency: 1,
    toolThreads: 1,
    fixtureConcurrency: 1,
    testWorkers: 1,
    maxConcurrency: 1,
  });
  expect(resolveVerifyLimits(4, {})).toEqual({
    jobs: 2,
    staticConcurrency: 2,
    toolThreads: 2,
    fixtureConcurrency: 2,
    testWorkers: 2,
    maxConcurrency: 2,
  });
  expect(resolveVerifyLimits(8, {})).toEqual({
    jobs: 3,
    staticConcurrency: 2,
    toolThreads: 2,
    fixtureConcurrency: 2,
    testWorkers: 3,
    maxConcurrency: 3,
  });
  expect(resolveVerifyLimits(16, {})).toEqual({
    jobs: 6,
    staticConcurrency: 2,
    toolThreads: 2,
    fixtureConcurrency: 2,
    testWorkers: 6,
    maxConcurrency: 4,
  });
});

test("resolveVerifyLimits honors BLAST_VERIFY_JOBS and rejects invalid values", () => {
  expect(resolveVerifyLimits(8, { BLAST_VERIFY_JOBS: "4" })).toEqual({
    jobs: 4,
    staticConcurrency: 2,
    toolThreads: 2,
    fixtureConcurrency: 2,
    testWorkers: 4,
    maxConcurrency: 4,
  });
  expect(resolveVerifyLimits(8, { BLAST_VERIFY_JOBS: " 1 " }).testWorkers).toBe(1);
  expect(resolveVerifyLimits(8, { BLAST_VERIFY_JOBS: "   " }).testWorkers).toBe(3);
  for (const bad of ["0", "-2", "abc", "2.5"]) {
    expect(() => resolveVerifyLimits(8, { BLAST_VERIFY_JOBS: bad })).toThrow("BLAST_VERIFY_JOBS");
  }
});

test("verify lock waits, reports its holder, and releases", async () => {
  const root = mkdtempSync(join(tmpdir(), "blast-verify-lock-"));
  try {
    const lockPath = join(root, "blast-verify.lock");
    const logs: string[] = [];
    const first = await acquireVerifyLock({ lockPath, pid: 101, registerSignals: false });
    expect(first).toBeDefined();
    const releaseFirst = () => first?.release();
    const second = acquireVerifyLock({
      lockPath,
      pid: 202,
      pollMs: 1,
      registerSignals: false,
      isAlive: (pid) => pid === 101,
      log: (line) => logs.push(line),
      sleep: async () => {
        releaseFirst?.();
        await Promise.resolve();
      },
    });
    const secondLock = await second;
    expect(secondLock?.info.pid).toBe(202);
    expect(logs.some((line) => line.includes("waiting for lock held by pid 101"))).toBe(true);
    secondLock?.release();
    expect(() => readFileSync(lockPath)).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify lock reclaims stale files and honors the opt-out", async () => {
  const root = mkdtempSync(join(tmpdir(), "blast-verify-lock-"));
  try {
    const lockPath = join(root, "blast-verify.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 404, startedAt: 1, cwd: root, token: "old" }));
    const lock = await acquireVerifyLock({
      lockPath,
      pid: 505,
      staleMs: 10,
      now: () => 100,
      isAlive: () => false,
      registerSignals: false,
    });
    expect(lock?.info.pid).toBe(505);
    lock?.release();
    expect(await acquireVerifyLock({ lockPath, env: { BLAST_VERIFY_LOCK: "0" } })).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
