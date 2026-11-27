import { expect, test } from "bun:test";
import { resolveVerifyLimits } from "./verify.ts";

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
