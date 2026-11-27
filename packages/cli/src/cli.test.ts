import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIRST_SCENE,
  helloList,
  hostSession,
  launchFixture,
  root,
  runCli,
} from "./cli-test-helper.ts";

test("the first scene prints as a stable text tree and exits 0", async () => {
  const { code, stdout, stderr } = await runCli(["run", helloList, "index"]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toBe(FIRST_SCENE);
}, 30_000);

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
}, 30_000);

test("without --grant the copy is denied and reported, and the run still exits 0", async () => {
  const { code, stdout } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "action Copy banana\nquit\n",
  );
  expect(code).toBe(0);
  expect(stdout).toContain("# capability clipboard.copy denied");
  expect(stdout).not.toContain('{"text":"banana"}');
}, 30_000);

test("a failing expect reports the miss on stderr and exits 1", async () => {
  const { code, stdout, stderr } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "expect durian\n",
  );
  expect(code).toBe(1);
  expect(stdout).toBe(FIRST_SCENE);
  expect(stderr).toContain('expected the scene to contain "durian"');
}, 30_000);

test("an unknown script command exits 1", async () => {
  const { code, stderr } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "kick apple\n",
  );
  expect(code).toBe(1);
  expect(stderr).toContain('unknown command "kick"');
}, 30_000);

test("a crashing extension exits 3", async () => {
  const { code, stdout, stderr } = await runCli(
    ["run", hostSession, "session", "--script", "-"],
    "action Crash\nwait\n",
  );
  expect(code).toBe(3);
  expect(stdout).toContain("# log host fixture loaded");
  expect(stderr).toContain("runtime exited with code 3");
}, 30_000);

test("missing dependencies print package names and exit 3", async () => {
  const { code, stdout, stderr } = await runCli([
    "run",
    join(root, "fixtures/extensions/missing-dependency"),
    "index",
  ]);
  expect(code).toBe(3);
  expect(stdout).toBe("");
  expect(stderr).toContain("Missing dependencies: @blast-missing/scoped, blast-unavailable");
}, 30_000);

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
}, 30_000);

test("--argument supplies manifest values and errors on missing or unknown ones", async () => {
  const provided = await runCli(
    [
      "run",
      launchFixture,
      "index",
      "--argument",
      "query=hello",
      "--argument",
      "option=one",
      "--script",
      "-",
    ],
    "expect hello one userInitiated idle\nquit\n",
  );
  expect(provided.code, provided.stderr).toBe(0);
  expect(provided.stderr).toBe("");
  // The manifest arguments reach the props, and `Image.Mask` values pass through.
  expect(provided.stdout).toContain('List navigationTitle="launch hello one userInitiated idle"');
  expect(provided.stdout).toContain('icon={"source":"avatar.png","mask":"circle"}');

  const missing = await runCli(["run", launchFixture, "index"]);
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain('missing required argument query for "index"');
  const unknown = await runCli([
    "run",
    launchFixture,
    "index",
    "--argument",
    "bogus=1",
    "--argument",
    "query=hello",
  ]);
  expect(unknown.code).toBe(2);
  expect(unknown.stderr).toContain('command "index" has no argument "bogus"');
  const malformed = await runCli(["run", launchFixture, "index", "--argument", "query"]);
  expect(malformed.code).toBe(2);
  expect(malformed.stderr).toContain("--argument must be name=value");
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("--argument <name=value>");
}, 30_000);

test("--grant command.launch accepts the launch and a denial reaches the command", async () => {
  const granted = await runCli(
    [
      "run",
      launchFixture,
      "index",
      "--argument",
      "query=hello",
      "--grant",
      "command.launch",
      "--script",
      "-",
    ],
    "action Launch\nwait\nexpect launched\nquit\n",
  );
  expect(granted.code, granted.stderr).toBe(0);
  expect(granted.stdout).toContain(
    '# capability command.launch {"name":"index","type":"userInitiated","arguments":{"query":"nested"},"context":{"from":"launch"}}',
  );
  // The launched command does not start a second session yet.
  expect(granted.stdout).not.toContain("nested none userInitiated idle");

  const denied = await runCli(
    ["run", launchFixture, "index", "--argument", "query=hello", "--script", "-"],
    "action Launch\nwait\nexpect failed Capability denied\nquit\n",
  );
  expect(denied.code, denied.stderr).toBe(0);
  expect(denied.stdout).toContain("# capability command.launch denied");
}, 30_000);

test("closeMainWindow records its request on the Navigation scene node", async () => {
  const view = await runCli(
    ["run", launchFixture, "index", "--argument", "query=hello", "--script", "-"],
    "action Close\nwait\nwait\nexpect closed\nquit\n",
  );
  expect(view.code, view.stderr).toBe(0);
  expect(view.stderr).toBe("");
  expect(view.stdout).toContain(
    'Navigation depth=1 closeMainWindow={"clearRootSearch":true,"popToRootType":"immediate"}',
  );
  // A no-view command has no scene until the request mounts one.
  const noView = await runCli(["run", launchFixture, "close"]);
  expect(noView.code, noView.stderr).toBe(0);
  expect(noView.stderr).toBe("");
  expect(noView.stdout).toContain(
    'closeMainWindow={"clearRootSearch":true,"popToRootType":"suspended"}',
  );
}, 30_000);

// @covers LaunchProps.draftValues
test("Form storeValue and drafts survive CLI launches, submit clears drafts and passwords stay private", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-form-persistence-"));
  const args = [
    "run",
    join(root, "fixtures/extensions/form"),
    "persist",
    "--data-dir",
    dataDir,
    "--script",
    "-",
  ];
  try {
    const first = await runCli(
      args,
      "field stored remembered\nwait\nfield draft unfinished\nwait\nfield controlled typed\nwait\nfield date 2026-01-01T00:00:00.000Z\nwait\nfield password secret-value\nwait\nquit\n",
    );
    expect(first.code, first.stdout + first.stderr).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).not.toContain("secret-value");
    const file = join(dataDir, "internal", "storage", "form.json");
    const saved = await readFile(file, "utf8");
    expect(JSON.parse(JSON.parse(saved)["blast:draft:persist"])).toMatchObject({
      draft: "unfinished",
      controlled: "typed",
      date: { $date: "2026-01-01T00:00:00.000Z" },
    });
    expect(saved).not.toContain("password");
    expect(saved).not.toContain("secret-value");
    expect(JSON.parse(saved)['blast:field:["persist","stored"]']).toBe('"remembered"');
    const second = await runCli(
      args,
      'wait\nexpect launch:unfinished:true\nexpect value="remembered"\nexpect value="typed"\nsubmit\nwait\nexpect submitted\nquit\n',
    );
    expect(second.code, second.stdout + second.stderr).toBe(0);
    expect(second.stderr).toBe("");
    expect(JSON.parse(await readFile(file, "utf8"))).not.toHaveProperty("blast:draft:persist");
    const third = await runCli(
      args,
      'wait\nwait\nexpect launch:none:false\nexpect value="remembered"\nquit\n',
    );
    expect(third.code, third.stdout + third.stderr).toBe(0);
    expect(third.stderr).toBe("");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);
