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
});

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
});

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
  expect(code, `${stderr}\n${stdout}`).toBe(0);
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
        "3000",
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
});

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
});

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
});

test("a dropdown without onChange reports a script error", async () => {
  const { code, stderr } = await runCli(
    ["run", helloList, "index", "--script", "-"],
    "dropdown beer\n",
  );
  expect(code).toBe(1);
  expect(stderr).toContain("no List.Dropdown or Grid.Dropdown with onChange to select");
});

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
});

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
        "5000",
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
});

test("without --applications or --clipboard the read-only defaults are empty", async () => {
  const result = await runCli(
    ["run", hostApis, "index", "--script", "-", "--timeout", "5000"],
    "action Applications\nwait\nexpect applications\naction Read Text\nwait\nexpect text none\nquit\n",
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("# capability applications.list {}");
  expect(result.stdout).toContain("# capability clipboard.read {}");
});

test("clipboard.paste and clipboard.clear need a grant", async () => {
  const script = "action Paste\nwait\naction Clear\nwait\nexpect failed Capability denied\nquit\n";
  const denied = await runCli(
    ["run", hostApis, "index", "--script", "-", "--timeout", "5000"],
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
      "5000",
    ],
    "action Paste\nwait\nexpect pasted\naction Clear\nwait\nexpect cleared\nquit\n",
  );
  expect(granted.code, granted.stderr).toBe(0);
  expect(granted.stdout).toContain('# capability clipboard.paste {"text":"pasted"}');
  expect(granted.stdout).toContain("# capability clipboard.clear {}");
});

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
});

test("CLI edits controlled and uncontrolled form fields and submits typed values", async () => {
  const args = [
    "run",
    join(root, "fixtures/extensions/form"),
    "index",
    "--script",
    "-",
    "--timeout",
    "3000",
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
});

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
});

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
});

test("command metadata is recorded and printed without a grant", async () => {
  const result = await runCli(["run", launchFixture, "metadata", "--timeout", "1500"]);
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
      "5000",
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
    "comma-separated paths",
  ])
    expect(help.stdout).toContain(flag);
});

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
});
