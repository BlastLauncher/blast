import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAlfredFixture } from "../../host/src/test-helper.ts";
import { runCli } from "./cli-test-helper.ts";

let scratch = "";
let fixture: { dir: string; archive: string };
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "blast-cli-alfred-"));
  fixture = await writeAlfredFixture(scratch);
});
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function withDataDir<T>(run: (dataDir: string) => Promise<T>): Promise<T> {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-cli-alfred-data-"));
  try {
    return await run(dataDir);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

// The Script Filter needs a query, so its scenes are deterministic: one
// waiting scene, then a loading and a result scene per search.
const SEARCH_AND_COPY = `expect Say hello
search world
wait
wait
expect List.Item "Hello world"
action Open
wait
expect closeMainWindow=true
quit
`;

for (const kind of ["directory", "archive"] as const) {
  const source = () => (kind === "directory" ? fixture.dir : fixture.archive);

  test(`blast run <${kind}> greet: search, action and a granted copy`, async () => {
    await withDataDir(async (dataDir) => {
      const result = await runCli(
        [
          "run",
          source(),
          "greet",
          "--data-dir",
          dataDir,
          "--grant",
          "clipboard.copy",
          "--script",
          "-",
        ],
        SEARCH_AND_COPY,
      );
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('List navigationTitle="Greet"');
      expect(result.stdout).toContain('# capability clipboard.copy {"text":"world"}');
      // Icons resolve in the workflow directory: in place, or the extraction cache.
      const workflows = join(dataDir, "workflows");
      const workflowDir =
        kind === "directory" ? fixture.dir : join(workflows, (await readdir(workflows))[0]!);
      expect(result.stdout).toContain(`icon="${join(workflowDir, "sf.png")}"`);
      // Neither the workflow nor its extraction is cleaned up like a bundle.
      expect(existsSync(join(workflowDir, "info.plist"))).toBe(true);
    });
  }, 30_000);

  test(`blast run <${kind}> site --json: a Keyword opens its URL and exits`, async () => {
    await withDataDir(async (dataDir) => {
      const result = await runCli([
        "run",
        source(),
        "site",
        "--argument",
        "query=docs",
        "--data-dir",
        dataDir,
        "--grant",
        "open.url",
        "--json",
      ]);
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      const lines = result.stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string; name?: string; params?: unknown });
      expect(lines.filter((line) => line.type === "capability.request")).toEqual([
        expect.objectContaining({ name: "open.url", params: { url: "https://example.com/docs" } }),
      ]);
    });
  }, 30_000);
}

test("blast run on a workflow: an ungranted capability is denied and printed", async () => {
  await withDataDir(async (dataDir) => {
    const result = await runCli(
      ["run", fixture.archive, "greet", "--data-dir", dataDir, "--script", "-"],
      SEARCH_AND_COPY,
    );
    expect(result.stdout).toMatch(/# capability clipboard\.copy [a-z_]+/);
    expect(result.stdout).not.toContain('# capability clipboard.copy {"text":"world"}');
  });
}, 30_000);

test("blast run on a workflow: bad commands and arguments are usage errors", async () => {
  await withDataDir(async (dataDir) => {
    const unknown = await runCli(["run", fixture.archive, "nope", "--data-dir", dataDir]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("Unknown extension command: nope");

    const missing = await runCli(["run", fixture.dir, "site", "--data-dir", dataDir]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("missing required argument query");

    const extra = await runCli([
      "run",
      fixture.dir,
      "greet",
      "--argument",
      "query=x",
      "--data-dir",
      dataDir,
    ]);
    expect(extra.code).toBe(2);
    expect(extra.stderr).toContain('command "greet" has no argument "query"');
  });
}, 30_000);
