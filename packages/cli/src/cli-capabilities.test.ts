import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  actionsVariants,
  hostApis,
  launchFixture,
  root,
  runCli,
  storageFixture,
} from "./cli-test-helper.ts";

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
}, 30_000);

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
}, 30_000);

test("--applications and --clipboard answer the read-only host capabilities", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-cli-apis-"));
  const applicationsFile = join(dataDir, "applications.json");
  await writeFile(
    applicationsFile,
    JSON.stringify([
      { name: "Safari", path: "/Applications/Safari.app", bundleId: "com.apple.Safari" },
      { name: "TextEdit", path: "/Applications/TextEdit.app", localizedName: "TextEdit" },
    ]),
  );
  try {
    const result = await runCli(
      [
        "run",
        hostApis,
        "index",
        "--data-dir",
        dataDir,
        "--applications",
        applicationsFile,
        "--clipboard",
        "hello",
        "--script",
        "-",
        "--timeout",
        "20000",
      ],
      [
        "action Applications",
        "wait",
        "expect applications Safari,TextEdit",
        "action Applications For Path",
        "wait",
        "expect path applications 2",
        "action Read",
        "wait",
        "expect read hello no-file no-html",
        "action Read Text",
        "wait",
        "expect text hello",
        "action Read History",
        "wait",
        "expect history none",
        "action Open Extension Preferences",
        "wait",
        "expect extension preferences",
        "action Open Command Preferences",
        "wait",
        "expect command preferences",
        "quit",
        "",
      ].join("\n"),
    );
    expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("# capability applications.list {}");
    expect(result.stdout).toContain('# capability applications.list {"path":"/tmp/report.txt"}');
    expect(result.stdout).toContain("# capability clipboard.read {}");
    expect(result.stdout).toContain('# capability clipboard.read {"offset":1}');
    expect(result.stdout).toContain('# capability preferences.open {"scope":"extension"}');
    expect(result.stdout).toContain('# capability preferences.open {"scope":"command"}');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);

test("without --applications or --clipboard the read-only defaults are empty", async () => {
  const result = await runCli(
    ["run", hostApis, "index", "--script", "-", "--timeout", "20000"],
    "action Applications\nwait\nexpect applications\naction Read Text\nwait\nexpect text none\nquit\n",
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("# capability applications.list {}");
  expect(result.stdout).toContain("# capability clipboard.read {}");
}, 30_000);

test("clipboard.paste and clipboard.clear need a grant", async () => {
  const script = "action Paste\nwait\naction Clear\nwait\nexpect failed Capability denied\nquit\n";
  const denied = await runCli(
    ["run", hostApis, "index", "--script", "-", "--timeout", "20000"],
    script,
  );
  expect(denied.code, denied.stderr).toBe(0);
  expect(denied.stdout).toContain("# capability clipboard.paste denied");
  expect(denied.stdout).toContain("# capability clipboard.clear denied");

  const granted = await runCli(
    [
      "run",
      hostApis,
      "index",
      "--grant",
      "clipboard.paste",
      "--grant",
      "clipboard.clear",
      "--script",
      "-",
      "--timeout",
      "20000",
    ],
    "action Paste\nwait\nexpect pasted\naction Clear\nwait\nexpect cleared\nquit\n",
  );
  expect(granted.code, granted.stderr).toBe(0);
  expect(granted.stdout).toContain(
    '# capability clipboard.paste {"text":"pasted","closeMainWindow":true}',
  );
  expect(granted.stdout).toContain("# capability clipboard.clear {}");
}, 30_000);

test("a bad --applications file is a usage error", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-cli-apis-"));
  const invalidFile = join(dataDir, "invalid.json");
  await writeFile(invalidFile, "{}");
  try {
    const missing = await runCli([
      "run",
      hostApis,
      "index",
      "--applications",
      join(dataDir, "absent.json"),
    ]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("cannot read --applications file");
    const invalid = await runCli(["run", hostApis, "index", "--applications", invalidFile]);
    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toContain("must be a JSON array of applications");
    const help = await runCli(["--help"]);
    expect(help.stdout).toContain("--applications <file.json>");
    expect(help.stdout).toContain("--clipboard <text>");
    expect(help.stdout).toContain("clipboard.paste and clipboard.clear still need");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);

test("command metadata is recorded and printed without a grant", async () => {
  const result = await runCli(["run", launchFixture, "metadata", "--timeout", "20000"]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe(
    '# capability command.metadata {"subtitle":"Current thing"}\n' +
      '# capability command.metadata {"subtitle":null}\n' +
      "# capability command.metadata {}\n",
  );
}, 2500);

test("selection flags supply read-only values and FilePicker submits comma-separated paths", async () => {
  const fixture = join(root, "fixtures/extensions/selection");
  const result = await runCli(
    [
      "run",
      fixture,
      "index",
      "--selected-text",
      "hello selected",
      "--selected-files",
      "/tmp/a",
      "--selected-files",
      "/tmp/b",
      "--frontmost",
      "org.editor",
      "--script",
      "-",
      "--timeout",
      "20000",
    ],
    "action Text\nwait\nexpect hello selected\naction Files\nwait\nexpect /tmp/b\naction Frontmost\nwait\nexpect org.editor\nfield files /tmp/a,/tmp/b\nwait\nsubmit\nwait\nexpect /tmp/a\nquit\n",
  );
  expect(result.code, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain('value=["/tmp/a","/tmp/b"]');
  expect(result.stdout).toContain('navigationTitle="{\\"files\\":[\\"/tmp/a\\",\\"/tmp/b\\"]}"');
  const defaults = await runCli(
    ["run", fixture, "index", "--script", "-"],
    "action Text\nwait\nexpect No text selected\naction Files\nwait\nexpect []\naction Frontmost\nwait\nexpect Headless\nfield files /tmp/a\nwait\nfield files \nwait\nsubmit\nwait\nexpect []\nquit\n",
  );
  expect(defaults.code, defaults.stderr + defaults.stdout).toBe(0);
  const help = await runCli(["--help"]);
  for (const flag of [
    "--selected-text <text>",
    "--selected-files <path>",
    "--frontmost <bundleId>",
    "comma-separated values",
  ])
    expect(help.stdout).toContain(flag);
}, 30_000);

test("CLI finder and trash effects record grants and report denials", async () => {
  const args = ["run", join(root, "fixtures/extensions/selection"), "index", "--script", "-"];
  const denied = await runCli(
    args,
    "action Reveal\nwait\nexpect Capability denied\naction Trash\nwait\nexpect Capability denied\nquit\n",
  );
  expect(denied.code, denied.stderr).toBe(0);
  expect(denied.stdout).toContain("# capability finder.show denied");
  expect(denied.stdout).toContain("# capability trash denied");
  const granted = await runCli(
    [...args, "--grant", "finder.show", "--grant", "trash"],
    "action Reveal\nwait\nexpect revealed\naction Trash\nwait\nexpect trashed\nquit\n",
  );
  expect(granted.code, granted.stderr).toBe(0);
  expect(granted.stdout).toContain('# capability finder.show {"path":"/tmp/a"}');
  expect(granted.stdout).toContain('# capability trash {"paths":["/tmp/a","/tmp/b"]}');
}, 30_000);

test("Action.Open requests open.path only with a grant and the scene never shows the target", async () => {
  const granted = await runCli(
    ["run", actionsVariants, "index", "--grant", "open.path", "--script", "-"],
    "action Open Target\nwait\nquit\n",
  );
  expect(granted.code, granted.stderr).toBe(0);
  expect(granted.stdout).toContain(
    '# capability open.path {"path":"/tmp/blast-demo","application":"Finder"}',
  );
  expect(granted.stdout).toContain("opened /tmp/blast-demo");
  expect(granted.stdout).not.toContain("target=");
  expect(granted.stdout).not.toContain('Open Target "/tmp');
  const denied = await runCli(
    ["run", actionsVariants, "index", "--script", "-"],
    "action Open Target\nquit\n",
  );
  expect(denied.code).toBe(0);
  expect(denied.stdout).toContain("# capability open.path denied");
  expect(denied.stdout).not.toContain("opened /tmp/blast-demo");
}, 30_000);
