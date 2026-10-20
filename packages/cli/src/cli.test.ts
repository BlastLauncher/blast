import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The CLI is exercised as a real `node` child process: it must run without a
// build step under plain Node 24 and leave no processes or temp files behind.
const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const helloList = join(root, "fixtures/extensions/hello-list");
const hostSession = join(root, "fixtures/extensions/host-session");
const hostApis = join(root, "fixtures/extensions/host-apis");
const listExtras = join(root, "fixtures/extensions/list-extras");
const gridFixture = join(root, "fixtures/extensions/grid");
const storageFixture = join(root, "fixtures/extensions/storage");
const launchFixture = join(root, "fixtures/extensions/launch");

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
}, 30_000);

test("--timeout aborts a hanging script with exit 3", async () => {
  const { code, stderr } = await runCli(
    ["run", helloList, "index", "--timeout", "800", "--script", "-"],
    "wait\nwait\n",
  );
  expect(code).toBe(3);
  expect(stderr).toContain("timed out after 800ms");
}, 30_000);

test("Action.Push opens a view and back restores the previous state", async () => {
  const { code, stdout, stderr } = await runCli(
    ["run", hostSession, "navigation", "--script", "-"],
    "action Increment\nwait\nexpect count 1\naction Open details\nwait\nexpect pushed detail\nback\nwait\nexpect count 1\nexpect popped true\nquit\n",
  );
  expect(code, `${stderr}\n${stdout}`).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain("Navigation depth=2 [pop]");
  const last = stdout.slice(stdout.lastIndexOf("Navigation depth=1"));
  expect(last).toContain("count 1 popped true");
  expect(last).not.toContain("pushed detail");
}, 30_000);

test("back at the root reports a script error and help documents back", async () => {
  const result = await runCli(["run", helloList, "index", "--script", "-"], "back\n");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("no navigation view to pop");
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("back            Pop the current navigation view.");
}, 30_000);

test("CLI confirms and dismisses no-view alerts and prints toast/HUD feedback", async () => {
  for (const [answer, title] of [
    ["confirm", "Confirmed"],
    ["dismiss", "Dismissed"],
  ]) {
    const result = await runCli(
      [
        "run",
        join(root, "fixtures/extensions/feedback"),
        "index",
        "--script",
        "-",
        "--timeout",
        "20000",
      ],
      `wait\nexpect Continue?\n${answer}\nwait\n`,
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Toast "${title}"`);
    expect(result.stdout).toContain('HUD "Finished"');
  }
  const missing = await runCli(["run", helloList, "index", "--script", "-"], "confirm\n");
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("no alert to answer");
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("Confirm the current alert");
  expect(help.stdout).toContain("Dismiss the current alert");
}, 30_000);

test("list-extras renders accessories and a dropdown scene", async () => {
  const { code, stdout, stderr } = await runCli(["run", listExtras, "index"]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain('List.Dropdown tooltip="Drink" defaultValue="water" [onChange]');
  expect(stdout).toContain('List.Dropdown.Section "Drinks"');
  expect(stdout).toContain('List.Dropdown.Item "beer" value="beer"');
  expect(stdout).toContain('subtitle="Germany"');
  expect(stdout).toContain('accessories=[{"text":"Germany"},{"tag":"1970-01-01T00:00:00.000Z"}]');
  expect(stdout).toContain('style="destructive"');
}, 30_000);

test("a script selects a dropdown value, searches and runs styled actions", async () => {
  const script = [
    "dropdown wine",
    "wait",
    "expect drink wine",
    "search w",
    "wait",
    "action Delete wine",
    "wait",
    "expect deleted wine",
    "quit",
    "",
  ].join("\n");
  const { code, stdout, stderr } = await runCli(
    ["run", listExtras, "index", "--script", "-"],
    script,
  );
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain('List navigationTitle="drink wine"');
  expect(stdout).toContain('searchText="w"');
  const last = stdout.slice(stdout.lastIndexOf('List navigationTitle="drink wine"'));
  expect(last).toContain('searchText="deleted wine"');
  expect(last).not.toContain("List.Item");
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("dropdown <value>");
}, 30_000);

test("a dropdown without onChange reports a script error", async () => {
  const { code, stderr } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "dropdown beer\n",
  );
  expect(code).toBe(1);
  expect(stderr).toContain("no List.Dropdown or Grid.Dropdown with onChange to select");
}, 30_000);

test("grid renders items, sections and a dropdown scene", async () => {
  const { code, stdout, stderr } = await runCli(["run", gridFixture, "index"]);
  expect(code).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain('Grid navigationTitle="grid"');
  expect(stdout).toContain('columns=3 aspectRatio="1" fit="contain" inset="sm"');
  expect(stdout).toContain('Grid.Dropdown tooltip="Drink" defaultValue="water" [onChange]');
  expect(stdout).toContain('Grid.Dropdown.Section "Drinks"');
  expect(stdout).toContain('Grid.Dropdown.Item "beer" value="beer"');
  expect(stdout).toContain('Grid.Item "beer" content={"value":"beer.png","tooltip":"Germany"}');
  expect(stdout).toContain('accessory={"icon":"star.png"}');
}, 30_000);

test("a script searches a Grid, selects its dropdown value and runs actions", async () => {
  const script = [
    "dropdown wine",
    "wait",
    "expect drink wine",
    "search wa",
    "wait",
    "action Delete water",
    "wait",
    "expect deleted water",
    "search z",
    "wait",
    "expect Grid.EmptyView",
    "quit",
    "",
  ].join("\n");
  const { code, stdout, stderr } = await runCli(
    ["run", gridFixture, "index", "--script", "-"],
    script,
  );
  expect(code, `${stderr}\n${stdout}`).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toContain('Grid navigationTitle="drink wine"');
  const last = stdout.slice(stdout.lastIndexOf('Grid navigationTitle="drink wine"'));
  expect(last).toContain('Grid.EmptyView "Nothing"');
  expect(last).toContain('searchText="z"');
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("Dispatch the List or Grid onSearchTextChange handler.");
}, 30_000);

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
  expect(granted.stdout).toContain('# capability clipboard.paste {"text":"pasted"}');
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

test("CLI edits controlled and uncontrolled form fields and submits typed values", async () => {
  const args = [
    "run",
    join(root, "fixtures/extensions/form"),
    "index",
    "--script",
    "-",
    "--timeout",
    "20000",
  ];
  const result = await runCli(
    args,
    "field name Ada\nwait\nfield notes Hello world\nwait\nfield drink tea\nwait\nfield agree true\nwait\nfield date 2026-10-18T12:00:00.000Z\nwait\nsubmit\nwait\nquit\n",
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain(
    'navigationTitle="{\\"name\\":\\"Ada\\",\\"notes\\":\\"Hello world\\",\\"drink\\":\\"tea\\",\\"agree\\":true,\\"date\\":\\"2026-10-18T12:00:00.000Z\\"}"',
  );
  const invalid = await runCli(args, "field agree yes\n");
  expect(invalid.code).toBe(1);
  expect(invalid.stderr).toContain("checkbox field value must be true or false");
  const missing = await runCli(args, "field missing text\n");
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("no editable Form field");
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("field <id> <value>");
  expect(help.stdout).toContain("Run the first Action.SubmitForm");
}, 30_000);

test("CLI fills TagPicker and PasswordField; the password never reaches a scene", async () => {
  const password = "s3cret-w0rd";
  const result = await runCli(
    [
      "run",
      join(root, "fixtures/extensions/form"),
      "secret",
      "--script",
      "-",
      "--timeout",
      "20000",
    ],
    `expect Docs\nfield tags red,green\nwait\nfield password ${password}\nwait\nsubmit\nwait\nquit\n`,
  );
  expect(result.code, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain('value=["red","green"]');
  expect(result.stdout).toContain('placeholder="Password" hasValue=true');
  expect(result.stdout).toContain(
    'navigationTitle="{\\"tags\\":[\\"red\\",\\"green\\"],\\"password\\":\\"<set>\\"}"',
  );
  expect(result.stdout).not.toContain(password);
  // The raw value is the client's input; only submissions published by the
  // extension would leak it, and the fixture masks them.
  const cleared = await runCli(
    [
      "run",
      join(root, "fixtures/extensions/form"),
      "secret",
      "--script",
      "-",
      "--timeout",
      "20000",
    ],
    `field password ${password}\nwait\nfield password\nwait\nsubmit\nwait\nquit\n`,
  );
  expect(cleared.code, cleared.stderr + cleared.stdout).toBe(0);
  expect(cleared.stdout).toContain('password\\":\\"<unset>');
}, 30_000);

test("a reader that closes stdout early does not crash the CLI", async () => {
  const child = spawn("node", [cliPath, "run", helloList, "index", "--script", "-"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  // Close our end after the first output, like `| head -1`, while the script
  // keeps producing scenes.
  child.stdout.once("data", () => child.stdout.destroy());
  child.stdin.end("search a\nwait\nsearch b\nwait\nsearch c\nwait\nquit\n");
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  expect(stderr).not.toContain("EPIPE");
  expect(code).toBe(0);
}, 30_000);

test("menu-bar trees print and action dispatches a left-click to nested items", async () => {
  const result = await runCli(
    ["run", join(root, "fixtures/extensions/menu-bar"), "index", "--script", "-"],
    "expect Ready\naction Click\nwait\nexpect left-click\nquit\n",
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('MenuBarExtra "Ready" isLoading=false');
  expect(result.stdout).toContain('MenuBarExtra.Section "Tools"');
  expect(result.stdout).toContain('MenuBarExtra.Submenu "More"');
  expect(result.stdout).toContain('MenuBarExtra.Item "Click" [onAction]');
  expect(result.stdout).not.toContain("Navigation");
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

const actionsVariants = join(root, "fixtures/extensions/actions-variants");

test("submenu dispatches a submenu's onOpen handler and its actions keep working", async () => {
  const result = await runCli(
    ["run", actionsVariants, "index", "--script", "-"],
    "submenu Labels\nwait\nexpect opened Labels\naction Red\nwait\nexpect picked Red\nquit\n",
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('ActionPanel.Submenu "Labels"');
  const lastScene = result.stdout.slice(result.stdout.lastIndexOf("Navigation depth=1"));
  expect(lastScene).toContain("opened Labels | picked Red");
  const unknown = await runCli(
    ["run", actionsVariants, "index", "--script", "-"],
    "submenu Nope\n",
  );
  expect(unknown.code).toBe(1);
  expect(unknown.stderr).toContain('no ActionPanel.Submenu with onOpen titled "Nope"');
  const help = await runCli(["--help"]);
  expect(help.stdout).toContain("submenu <title>");
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

test("more loads List and Grid pages in the active navigation entry and rejects exhausted views", async () => {
  const fixture = join(root, "fixtures/extensions/pagination");
  const result = await runCli(
    ["run", fixture, "index", "--script", "-"],
    "more\nwait\nexpect list page 2\naction Open Grid\nwait\nmore\nwait\nexpect grid page 2\nquit\n",
  );
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain('List.Item "list item 2"');
  expect(result.stdout).toContain('Grid.Item "grid item 2"');
  for (const command of ["index", "grid"]) {
    const exhausted = await runCli(
      ["run", fixture, command, "--script", "-"],
      "more\nwait\nmore\n",
    );
    expect(exhausted.code).toBe(1);
    expect(exhausted.stderr).toContain("no List or Grid with more pages to load");
  }
  const missing = await runCli(["run", helloList, "index", "--script", "-"], "more\n");
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("no List or Grid with more pages to load");
  expect((await runCli(["--help"])).stdout).toContain("more");
}, 30_000);

test("stored dropdown selections restore through the host storage capability across CLI runs", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-dropdown-"));
  try {
    const args = [
      "run",
      join(root, "fixtures/extensions/pagination"),
      "dropdown",
      "--data-dir",
      dataDir,
      "--script",
      "-",
    ];
    const first = await runCli(args, "dropdown wine\nwait\nexpect drink wine\nquit\n");
    expect(first.code).toBe(0);
    expect(first.stderr).toBe("");
    const second = await runCli(args, "wait\nwait\nexpect drink wine\nquit\n");
    expect(second.code).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toContain('value="wine"');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);

test("OAuth CLI answers authorization, persists tokens and redacts token requests in text and JSON", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-oauth-cli-"));
  const fixture = join(root, "fixtures/extensions/oauth");
  try {
    const denied = await runCli([
      "run",
      fixture,
      "index",
      "--data-dir",
      dataDir,
      "--grant",
      "oauth.authorize",
    ]);
    expect(denied.code).toBe(3);
    expect(denied.stdout + denied.stderr).toContain("Capability denied: oauth.authorize");
    for (const extra of [[], ["--json"]]) {
      const result = await runCli([
        "run",
        fixture,
        "index",
        "--data-dir",
        dataDir,
        "--oauth-code",
        "code",
        ...extra,
      ]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("oauth.tokens.set");
      expect(result.stdout).not.toContain("private-access-token");
      expect(result.stdout).not.toContain("private-refresh-token");
    }
    expect(
      JSON.parse(await readFile(join(dataDir, "oauth/storage/oauth.json"), "utf8")).Fixture
        .accessToken,
    ).toBe("private-access-token");
    expect((await runCli(["--help"])).stdout).toContain("--oauth-code <code>");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}, 30_000);

test("AI and browser flags grant deterministic responses and synchronous availability", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blast-ai-browser-"));
  const fixture = join(root, "fixtures/extensions/ai-browser");
  const tabs = join(directory, "tabs.json");
  try {
    await writeFile(
      tabs,
      JSON.stringify([
        { id: 1, url: "https://example.com", active: true, content: "active content" },
        {
          id: 2,
          url: "https://example.org",
          title: "Other",
          active: false,
          content: "other content",
        },
      ]),
    );
    const granted = await runCli([
      "run",
      fixture,
      "index",
      "--ai-answer",
      "fixed answer",
      "--browser-tabs",
      tabs,
    ]);
    expect(granted.code).toBe(0);
    expect(granted.stderr).toBe("");
    for (const text of [
      "access:true:true",
      "chunk:fixed answer",
      "answer:fixed answer",
      "active:active content",
      "specific:other content",
    ])
      expect(granted.stdout).toContain(text);
    expect(granted.stdout).toContain(
      'tabs:[{"id":1,"url":"https://example.com","active":true},{"id":2,"url":"https://example.org","active":false,"title":"Other"}]',
    );
    const denied = await runCli([
      "run",
      fixture,
      "index",
      "--grant",
      "ai.ask",
      "--grant",
      "browser.tabs",
    ]);
    expect(denied.code).toBe(0);
    for (const text of [
      "access:false:false",
      "Capability denied: ai.ask",
      "Capability denied: browser.tabs",
    ])
      expect(denied.stdout).toContain(text);
    const aiOnly = await runCli(["run", fixture, "index", "--ai-answer", ""]);
    expect(aiOnly.code).toBe(0);
    expect(aiOnly.stdout).toContain("access:true:false");
    const browserOnly = await runCli(["run", fixture, "index", "--browser-tabs", tabs]);
    expect(browserOnly.code).toBe(0);
    expect(browserOnly.stdout).toContain("access:false:true");
    await writeFile(tabs, '[{"id":"bad"}]');
    const invalid = await runCli(["run", fixture, "index", "--browser-tabs", tabs]);
    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toContain("--browser-tabs");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("models and complete expose the offline provider entrypoint", async () => {
  const fixture = join(root, "fixtures/extensions/model-provider");
  const listing = await runCli(["models", fixture]);
  expect(listing.code).toBe(0);
  expect(listing.stderr).toBe("");
  expect(JSON.parse(listing.stdout).map((model: { id: string }) => model.id)).toEqual([
    "text",
    "full",
  ]);
  const text = await runCli(["complete", fixture, "text", "hello"]);
  expect(text).toEqual({ code: 0, stdout: "Hello world", stderr: "" });
  const full = await runCli(["complete", fixture, "full", "hello"]);
  expect(full).toEqual({
    code: 0,
    stdout:
      'Hello world\n{"type":"finish","finishReason":"stop","totalUsage":{"inputTokens":1,"outputTokens":2,"totalTokens":3}}\n',
    stderr: "",
  });
  expect((await runCli(["complete", fixture, "missing", "hello"])).code).toBe(2);
  expect((await runCli(["models"])).code).toBe(2);
  expect((await runCli(["--help"])).stdout).toContain(
    "blast complete <extensionDir> <modelId> <prompt>",
  );
}, 30_000);

test("own-provider ask streams, refreshes, aborts and answers headless decisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-ai-"));
  try {
    const answers = join(dir, "answers.json");
    await writeFile(answers, JSON.stringify({ urgent: { type: "noul", noul: 0.8 } }));
    const args = [
      "run",
      join(root, "fixtures/extensions/model-provider"),
      "ask",
      "--data-dir",
      dir,
    ];
    const valid = await runCli([...args, "--ai-decide", answers]);
    expect(valid.code, valid.stderr + valid.stdout).toBe(0);
    for (const text of [
      "chunk:Hello ",
      "chunk:world",
      "answer:Hello world",
      "Unknown model missing",
      "abort:AbortError",
      "decide:0.8",
    ])
      expect(valid.stdout).toContain(text);
    const denied = await runCli([...args, "--grant", "ai.decide"]);
    expect(denied.code, denied.stderr).toBe(0);
    expect(denied.stdout).toContain("Capability denied: ai.decide");
    await writeFile(answers, '{"urgent":{"type":"noul","noul":2}}');
    const invalid = await runCli([...args, "--ai-decide", answers]);
    expect(invalid.code, invalid.stderr).toBe(0);
    expect(invalid.stdout).toContain("invalid answer");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("CLI prints a one-line warning for a shared dependency major mismatch", async () => {
  const fixture = join(root, "fixtures/extensions/shared-dependencies");
  const result = await runCli(["run", fixture, "default"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain(
    "# log Shared dependency lodash: declared ^3.0.0, provided 4.18.1 (major mismatch)\n",
  );
  const json = await runCli(["run", fixture, "subpath", "--json"]);
  expect(json.code).toBe(0);
  expect(
    json.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  ).toContainEqual({
    type: "log",
    level: "warn",
    message: "Shared dependency lodash: declared ^3.0.0, provided 4.18.1 (major mismatch)",
  });
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

test("--fallback-text reaches a fallback command, including an empty string", async () => {
  for (const text of ["unmatched query", ""]) {
    const result = await runCli([
      "run",
      launchFixture,
      "index",
      "--argument",
      "query=hello",
      "--fallback-text",
      text,
      "--json",
    ]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`"title":${JSON.stringify(text)}`);
  }
}, 30_000);
