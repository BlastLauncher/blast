import { describe, expect, test } from "bun:test";
import { decideVerifyAction, waitForCiVerify, type CheckRun } from "./wait-ci-verify.ts";

describe("wait-ci-verify", () => {
  test("classifies check-run states safely", () => {
    expect(decideVerifyAction([])).toBe("wait");
    expect(
      decideVerifyAction([{ id: 1, name: "verify", status: "in_progress", conclusion: null }]),
    ).toBe("wait");
    expect(
      decideVerifyAction([{ id: 1, name: "verify", status: "completed", conclusion: "success" }]),
    ).toBe("reused");
    expect(
      decideVerifyAction([{ id: 1, name: "verify", status: "completed", conclusion: "failure" }]),
    ).toBe("failed");
    expect(
      decideVerifyAction([{ id: 1, name: "verify", status: "completed", conclusion: "cancelled" }]),
    ).toBe("run-local");
    // A re-run that succeeded overrides an earlier failure, and a newer failure
    // overrides an earlier pass.
    expect(
      decideVerifyAction([
        { id: 1, name: "verify", status: "completed", conclusion: "failure" },
        { id: 2, name: "verify", status: "completed", conclusion: "success" },
      ]),
    ).toBe("reused");
    expect(
      decideVerifyAction([
        { id: 1, name: "verify", status: "completed", conclusion: "success" },
        { id: 2, name: "verify", status: "completed", conclusion: "failure" },
      ]),
    ).toBe("failed");
    expect(
      decideVerifyAction([
        { id: 1, name: "verify", status: "completed", conclusion: "success" },
        { id: 2, name: "verify", status: "in_progress", conclusion: null },
      ]),
    ).toBe("wait");
  });

  test("waits for an in-progress CI verify on push and reuses its success", () => {
    const replies: CheckRun[][] = [
      [],
      [{ id: 10, name: "verify", status: "in_progress", conclusion: null }],
      [{ id: 10, name: "verify", status: "completed", conclusion: "success" }],
    ];
    let index = 0;
    let clock = 0;
    const outcome = waitForCiVerify({
      fetchRuns: () => replies[Math.min(index++, replies.length - 1)]!,
      waitForAppear: true,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
      },
      log: () => undefined,
      pollMs: 5_000,
    });
    expect(outcome).toBe("reused");
    expect(clock).toBe(10_000);
  });

  test("runs locally immediately on workflow_dispatch when no CI check exists", () => {
    let sleeps = 0;
    const outcome = waitForCiVerify({
      fetchRuns: () => [],
      waitForAppear: false,
      now: () => 0,
      sleep: () => {
        sleeps++;
      },
      log: () => undefined,
    });
    expect(outcome).toBe("run-local");
    expect(sleeps).toBe(0);
  });

  test("fails fast when CI verify failed on this commit", () => {
    expect(() =>
      waitForCiVerify({
        fetchRuns: () => [{ id: 1, name: "verify", status: "completed", conclusion: "failure" }],
        waitForAppear: false,
        log: () => undefined,
      }),
    ).toThrow("CI verify failed");
  });

  test("falls back to local verify on API errors or cancelled CI", () => {
    expect(
      waitForCiVerify({ fetchRuns: () => null, waitForAppear: true, log: () => undefined }),
    ).toBe("run-local");
    expect(
      waitForCiVerify({
        fetchRuns: () => [{ id: 1, name: "verify", status: "completed", conclusion: "cancelled" }],
        waitForAppear: true,
        log: () => undefined,
      }),
    ).toBe("run-local");
  });
});
