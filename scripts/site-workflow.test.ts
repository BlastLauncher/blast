import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

type Job = {
  needs?: string | string[];
  permissions?: Record<string, string>;
};

describe("site workflow", () => {
  test("parses pinned actions and deployment dependencies", async () => {
    const source = await readFile(
      new URL("../.github/workflows/site.yml", import.meta.url),
      "utf8",
    );
    const workflow = Bun.YAML.parse(source) as { jobs: Record<string, Job> };
    const jobs = workflow.jobs;
    expect(jobs.build!.permissions).toEqual({ contents: "read" });
    expect(jobs.sandbox!.needs).toEqual("build");
    expect(jobs.pages!.needs).toEqual("sandbox");
    expect(jobs.pages!.permissions).toEqual({ pages: "write", "id-token": "write" });
    expect(jobs.smoke!.needs).toEqual(["pages", "sandbox"]);
    expect(jobs.smoke!.permissions).toEqual({ contents: "read" });
    for (const match of source.matchAll(/uses:\s+([^\s#]+)/g))
      expect(match[1]).toMatch(/@[0-9a-f]{40}$/);
  });
});
