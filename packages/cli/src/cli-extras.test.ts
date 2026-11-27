import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  actionsVariants,
  cliPath,
  FIRST_SCENE,
  helloList,
  launchFixture,
  nodePath,
  root,
  runCli,
} from "./cli-test-helper.ts";

test("a reader that closes stdout early does not crash the CLI", async () => {
  const child = spawn(nodePath, [cliPath, "run", helloList, "index", "--script", "-"], {
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
  // The menu is the active entry, like view commands, so feedback has a home.
  expect(result.stdout).toContain(
    'Navigation depth=1\n  Navigation.Entry active=true\n    MenuBarExtra "Ready"',
  );
}, 30_000);

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
    // Code and stderr together, so a CI failure shows the CLI's `# error` line.
    const first = await runCli(args, "dropdown wine\nwait\nexpect drink wine\nquit\n");
    expect({ code: first.code, stderr: first.stderr }).toEqual({ code: 0, stderr: "" });
    const second = await runCli(args, "wait\nwait\nexpect drink wine\nquit\n");
    expect({ code: second.code, stderr: second.stderr }).toEqual({ code: 0, stderr: "" });
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

test("--bundle-timeout accepts zero and a limit, and rejects invalid milliseconds", async () => {
  const timedOut = await runCli(["run", helloList, "index", "--bundle-timeout", "1"]);
  expect(timedOut.code).toBe(3);
  expect(timedOut.stderr).toContain("timed out after 1 ms");
  for (const value of ["0", "60000"]) {
    const result = await runCli(["run", helloList, "index", "--bundle-timeout", value]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(FIRST_SCENE);
  }
  for (const value of ["-1", "1.5", "NaN", "", "2147483648"]) {
    const result = await runCli(["run", helloList, "index", `--bundle-timeout=${value}`]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--bundle-timeout must be an integer");
  }
}, 15_000);

test("blast serve speaks the embedder protocol on stdio", async () => {
  const hello = JSON.stringify({ type: "hello", protocol: 2, capabilities: [] });
  const request = JSON.stringify({
    type: "request",
    id: "1",
    method: "extension.open",
    params: { dir: helloList },
  });
  const result = await runCli(["serve", "--dependencies", "manual"], `${hello}\n${request}\n`);
  expect(result.code).toBe(0);
  const lines = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines[0]).toMatchObject({ type: "welcome", protocol: 2 });
  expect(lines[1]).toMatchObject({ type: "response", id: "1", ok: true });
  expect((await runCli(["serve", "--dependencies", "bogus"])).code).toBe(3);
});
