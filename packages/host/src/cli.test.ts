import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The CLI is exercised as a real `node` child process: it must run without a
// build step under plain Node 24 and leave no processes or temp files behind.
const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const helloList = join(root, "fixtures/extensions/hello-list");
const hostSession = join(root, "fixtures/extensions/host-session");
const storageFixture = join(root, "fixtures/extensions/storage");

type CliResult = { code: number; stdout: string; stderr: string };

function runCli(args: string[], script?: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [cliPath, ...args], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
    // "--script -" reads stdin; closing it always so the CLI can finish.
    child.stdin.end(script);
  });
}

const FIRST_SCENE = `Navigation depth=1
  Navigation.Entry active=true
    List navigationTitle="hello-list" searchText="" [onSearchTextChange]
      List.Item "apple"
        Slot name="actions"
          ActionPanel
            Action.CopyToClipboard "Copy apple" [onAction]
            Action "Pin apple" [onAction]
      List.Item "banana"
        Slot name="actions"
          ActionPanel
            Action.CopyToClipboard "Copy banana" [onAction]
            Action "Pin banana" [onAction]
      List.Item "cherry"
        Slot name="actions"
          ActionPanel
            Action.CopyToClipboard "Copy cherry" [onAction]
            Action "Pin cherry" [onAction]
`;

test("the first scene prints as a stable text tree and exits 0", async () => {
  const { code, stdout, stderr } = await runCli(["run", helloList, "index"]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toBe(FIRST_SCENE);
});

test("a script pins, searches, copies with a grant and exits 0", async () => {
  const script = [
    "# pin one item",
    "action Pin cherry",
    "wait",
    "expect pinned cherry",
    "search an",
    "wait",
    "action Copy banana",
    "wait",
    "expect copied banana",
    "quit",
    "",
  ].join("\n");
  const { code, stdout, stderr } = await runCli(
    ["run", helloList, "index", "--grant", "clipboard.copy", "--script", "-"],
    script,
  );
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain('# capability clipboard.copy {"text":"banana"}');
  const lastScene = stdout.slice(
    stdout.lastIndexOf('List navigationTitle="pinned cherry copied banana"'),
  );
  expect(lastScene).toContain('List.Item "banana"');
  expect(lastScene).not.toContain('List.Item "apple"');
});

test("without --grant the copy is denied and reported, and the run still exits 0", async () => {
  const { code, stdout } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "action Copy banana\nquit\n",
  );
  expect(code).toBe(0);
  expect(stdout).toContain("# capability clipboard.copy denied");
  expect(stdout).not.toContain('{"text":"banana"}');
});

test("a failing expect reports the miss on stderr and exits 1", async () => {
  const { code, stdout, stderr } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "expect durian\n",
  );
  expect(code).toBe(1);
  expect(stdout).toBe(FIRST_SCENE);
  expect(stderr).toContain('expected the scene to contain "durian"');
});

test("an unknown script command exits 1", async () => {
  const { code, stderr } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "kick apple\n",
  );
  expect(code).toBe(1);
  expect(stderr).toContain('unknown command "kick"');
});

test("a crashing extension exits 3", async () => {
  const { code, stdout, stderr } = await runCli(
    ["run", hostSession, "session", "--script", "-"],
    "action Crash\nwait\n",
  );
  expect(code).toBe(3);
  expect(stdout).toContain("# log host fixture loaded");
  expect(stderr).toContain("runtime exited with code 3");
});

test("missing dependencies print package names and exit 3", async () => {
  const { code, stdout, stderr } = await runCli([
    "run",
    join(root, "fixtures/extensions/missing-dependency"),
    "index",
  ]);
  expect(code).toBe(3);
  expect(stdout).toBe("");
  expect(stderr).toContain("Missing dependencies: @blast-missing/scoped, blast-unavailable");
});

test("--json emits protocol-shaped NDJSON scenes", async () => {
  const { code, stdout, stderr } = await runCli(["run", helloList, "index", "--json"]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  const messages = stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { type: string; root: { type: string } | null });
  const scenes = messages.filter((message) => message.type === "scene");
  expect(scenes.length).toBeGreaterThanOrEqual(1);
  expect(scenes[0]?.root?.type).toBe("Navigation");
});

test("usage errors exit 2 and print usage", async () => {
  const missing = await runCli(["run"]);
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain("blast run <extensionDir> <command>");
  const flag = await runCli(["run", helloList, "index", "--bogus"]);
  expect(flag.code).toBe(2);
  const dataDir = await runCli(["run", helloList, "index", "--data-dir", ""]);
  expect(dataDir.code).toBe(2);
  expect(dataDir.stderr).toContain("--data-dir must not be empty");
  const command = await runCli(["run", helloList, "nope"]);
  expect(command.code).toBe(2);
  expect(command.stderr).toContain("Unknown extension command");
});

test("--timeout aborts a hanging script with exit 3", async () => {
  const { code, stderr } = await runCli(
    ["run", helloList, "index", "--timeout", "800", "--script", "-"],
    "wait\nwait\n",
  );
  expect(code).toBe(3);
  expect(stderr).toContain("timed out after 800ms");
});

test("Action.Push opens a view and back restores the previous state", async () => {
  const { code, stdout, stderr } = await runCli(
    ["run", hostSession, "navigation", "--script", "-"],
    "action Increment\nwait\nexpect count 1\naction Open details\nwait\nexpect pushed detail\nback\nwait\nexpect count 1\nexpect popped true\nquit\n",
  );
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain("Navigation depth=2 [pop]");
  const last = stdout.slice(stdout.lastIndexOf("Navigation depth=1"));
  expect(last).toContain("count 1 popped true");
  expect(last).not.toContain("pushed detail");
});

test("back at the root reports a script error and help documents back", async () => {
  const result = await runCli(["run", helloList, "index", "--script", "-"], "back\n");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("no navigation view to pop");
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("back            Pop the current navigation view.");
});

test("LocalStorage is granted by default and persists across runs in --data-dir", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-cli-storage-"));
  try {
    const first = await runCli(
      ["run", storageFixture, "index", "--data-dir", dataDir, "--script", "-"],
      "action Increment\nwait\nexpect count 1\nquit\n",
    );
    expect(first.code).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain('# capability storage.set {"key":"count","value":1}');
    expect(JSON.parse(await readFile(join(dataDir, "storage", "storage.json"), "utf8"))).toEqual({
      count: 1,
    });

    // A second process reads what the first wrote and continues from it.
    const second = await runCli(
      ["run", storageFixture, "index", "--data-dir", dataDir, "--script", "-"],
      "action Increment\nwait\nexpect count 2\naction All\nwait\nexpect all\naction Remove\nwait\nexpect removed\naction Clear\nwait\nexpect cleared\nquit\n",
    );
    expect(second.code).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toContain('# capability storage.get {"key":"count"}');
    expect(second.stdout).toContain("# capability storage.all {}");
    expect(second.stdout).toContain('# capability storage.remove {"key":"count"}');
    expect(JSON.parse(await readFile(join(dataDir, "storage", "storage.json"), "utf8"))).toEqual(
      {},
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("open prints each granted target and grants URLs and files separately", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-cli-open-"));
  try {
    // Granting URLs must not grant file opens: the path request stays denied.
    const urlOnly = await runCli(
      [
        "run",
        storageFixture,
        "index",
        "--data-dir",
        dataDir,
        "--grant",
        "open.url",
        "--script",
        "-",
      ],
      "action Open URL\nwait\nexpect opened url\naction Open File\nwait\nexpect failed\nquit\n",
    );
    expect(urlOnly.code).toBe(0);
    expect(urlOnly.stderr).toBe("");
    expect(urlOnly.stdout).toContain('# capability open.url {"url":"https://example.com/docs"}');
    expect(urlOnly.stdout).toContain("# capability open.path denied");

    const both = await runCli(
      [
        "run",
        storageFixture,
        "index",
        "--data-dir",
        dataDir,
        "--grant",
        "open.url",
        "--grant",
        "open.path",
        "--script",
        "-",
      ],
      "action Open File\nwait\nexpect opened file\nquit\n",
    );
    expect(both.code).toBe(0);
    expect(both.stderr).toBe("");
    expect(both.stdout).toContain(
      '# capability open.path {"path":"/tmp/report.txt","application":"TextEdit"}',
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
