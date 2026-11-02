import { expect, test } from "bun:test";
import { UPGRADE_STEPS, runUpgrade } from "./upgrade.ts";
import { compareVersions, decideUpgrade } from "./upgrade-job.ts";

test("upgrade runs generators in the dependency order", () => {
  const calls: string[][] = [];
  runUpgrade("2.10.1", (_command, args) => {
    calls.push(args);
    return 0;
  });
  expect(calls).toEqual(UPGRADE_STEPS.map((step) => ["run", step, "2.10.1"]));
});

test("upgrade stops at the first failed generator", () => {
  const calls: string[][] = [];
  expect(() =>
    runUpgrade("2.10.1", (_command, args) => {
      calls.push(args);
      return calls.length === 2 ? 1 : 0;
    }),
  ).toThrow("compat:inventory failed");
  expect(calls).toHaveLength(2);
});

test("upgrade job compares releases and names its branch and issue", () => {
  expect(compareVersions("2.10.1", "2.9.0")).toBe(1);
  expect(compareVersions("2.10.1", "2.10.1")).toBe(0);
  expect(decideUpgrade("2.8.2", "2.10.1", "owner/repo")).toEqual({
    needed: true,
    branch: "compat/raycast-api-2.10.1",
    issueTitle: "Upgrade @raycast/api to 2.10.1",
    compareUrl: "https://github.com/owner/repo/compare/main...compat/raycast-api-2.10.1",
  });
  expect(decideUpgrade("2.10.1", "2.10.1").needed).toBe(false);
  expect(decideUpgrade("2.10.1", "2.10.2-rc.1").needed).toBe(false);
  expect(decideUpgrade("2.10.1", "2.11.0+build.3").needed).toBe(false);
});
