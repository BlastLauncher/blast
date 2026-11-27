import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  gridFixture,
  helloList,
  hostSession,
  listExtras,
  root,
  runCli,
} from "./cli-test-helper.ts";

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
      `expect Continue?\n${answer}\nwait\n`,
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
