import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

type Job = {
  needs?: string | string[];
  permissions?: Record<string, string>;
  environment?: { name?: string };
  steps?: Array<{ run?: string; uses?: string; env?: Record<string, string> }>;
};

describe("site workflow", () => {
  test("parses pinned actions and deployment dependencies", async () => {
    const source = await readFile(
      new URL("../.github/workflows/site.yml", import.meta.url),
      "utf8",
    );
    const workflow = Bun.YAML.parse(source) as {
      jobs: Record<string, Job>;
      concurrency?: Record<string, unknown>;
    };
    const jobs = workflow.jobs;
    expect(jobs.build!.permissions).toEqual({ contents: "read" });
    expect(jobs.sandbox!.needs).toEqual("build");
    expect(jobs.pages!.needs).toEqual("sandbox");
    expect(jobs.pages!.permissions).toEqual({ pages: "write", "id-token": "write" });
    expect(jobs.pages!.environment?.name).toBe("github-pages");
    expect(workflow.concurrency?.["cancel-in-progress"]).toBe(false);
    expect(jobs.smoke!.needs).toEqual(["pages", "sandbox"]);
    expect(jobs.smoke!.permissions).toEqual({ contents: "read" });
    expect(jobs.smoke!.steps?.some((step) => step.run?.includes("site:smoke:browser"))).toBe(true);
    expect(
      jobs.smoke!.steps?.some((step) =>
        step.run?.includes("playwright@1.58.0 install --with-deps chromium"),
      ),
    ).toBe(true);
    expect(jobs.smoke!.steps?.some((step) => step.uses?.includes("actions/upload-artifact@"))).toBe(
      true,
    );
    // The browser smoke runs repo scripts, so the job must check out and install.
    const smokeSteps = JSON.stringify((jobs.smoke as { steps?: unknown[] }).steps ?? []);
    expect(smokeSteps).toContain("actions/checkout@");
    expect(smokeSteps).toContain("bun install --frozen-lockfile");
    for (const match of source.matchAll(/uses:\s+([^\s#]+)/g))
      expect(match[1]).toMatch(/@[0-9a-f]{40}$/);
  });
});
