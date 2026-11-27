import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  buildWorkflowEnv,
  escapeQuery,
  resolveScriptCommand,
  runWorkflowScript,
  workflowVariables,
} from "./scripts.ts";
import { parseWorkflow, type AlfredWorkflow } from "./workflow.ts";

const posix = process.platform !== "win32";
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "blast-alfred-scripts-"));
  await mkdir(join(dir, "bin"));
  await writeFile(join(dir, "bin", "echo-args.sh"), '#!/bin/sh\nprintf "%s|" "$@"\n');
  await chmod(join(dir, "bin", "echo-args.sh"), 0o755);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function workflow(): AlfredWorkflow {
  return {
    ...parseWorkflow({
      bundleid: "com.example.wf",
      name: "Example",
      description: "Does things",
      version: "2.0",
      variables: { api: "https://example.com", shared: "workflow" },
      userconfigurationconfig: [
        { type: "checkbox", variable: "verbose", config: { default: true } },
        { type: "textfield", variable: "shared", config: { default: "config" } },
        { type: "textfield", variable: "token", config: { default: "" } },
      ],
    }),
    dir: "/workflows/user.workflow.ABC",
  };
}

const argv = (type: number, script = "S") => ({ type, script, scriptargtype: 1 });

describe("resolveScriptCommand", () => {
  test("maps every interpreter type", () => {
    const table: [number, string, string[]][] = [
      [0, "/bin/bash", ["-c", "S", "--", "q"]],
      [1, "/usr/bin/php", ["-r", "S", "--", "q"]],
      [2, "/usr/bin/ruby", ["-e", "S", "--", "q"]],
      [3, "/usr/bin/python", ["-c", "S", "q"]],
      [4, "/usr/bin/perl", ["-e", "S", "--", "q"]],
      [5, "/bin/zsh", ["-c", "S", "--", "q"]],
      [6, "/usr/bin/osascript", ["-e", "S", "q"]],
      [7, "/usr/bin/osascript", ["-l", "JavaScript", "-e", "S", "q"]],
      [9, "/usr/bin/python3", ["-c", "S", "q"]],
      [10, "/usr/bin/swift", ["-", "q"]],
      [11, "/bin/zsh", ["--no-rcs", "-c", "S", "--", "q"]],
    ];
    for (const [type, command, args] of table) {
      const resolved = resolveScriptCommand(argv(type), dir, "q", "darwin");
      expect({ type, command: resolved.command, args: resolved.args }).toEqual({
        type,
        command,
        args,
      });
    }
    expect(resolveScriptCommand(argv(10), dir, "q", "darwin").stdin).toBe("S");
  });

  test("external scripts resolve inside the workflow", () => {
    const resolved = resolveScriptCommand(
      { type: 8, scriptfile: "bin/echo-args.sh", scriptargtype: 1 },
      dir,
      ["a", "b"],
    );
    expect(resolved.command).toBe(join(dir, "bin", "echo-args.sh"));
    expect(resolved.args).toEqual(["a", "b"]);
    expect(() => resolveScriptCommand({ type: 8, scriptfile: "../evil.sh" }, dir, "")).toThrow(
      /outside the workflow/,
    );
    expect(() => resolveScriptCommand({ type: 8 }, dir, "")).toThrow(/no scriptfile/);
  });

  test("osascript types fail cleanly off macOS", () => {
    expect(() => resolveScriptCommand(argv(6), dir, "q", "linux")).toThrow(
      "alfred: AppleScript scripts (type 6) need macOS; this host runs linux",
    );
    expect(() => resolveScriptCommand(argv(7), dir, "q", "win32")).toThrow(/type 7\) need macOS/);
    expect(() => resolveScriptCommand(argv(42), dir, "q")).toThrow(
      "alfred: unknown script type 42",
    );
  });

  test("{query} mode substitutes the escaped query", () => {
    const resolved = resolveScriptCommand(
      { type: 0, script: 'echo "{query}"', scriptargtype: 0, escaping: 4 + 16 + 32 },
      dir,
      'a "b" $c \\d',
    );
    expect(resolved.args).toEqual(["-c", 'echo "a \\"b\\" \\$c \\\\d"', "--"]);
  });

  test("a missing fixed interpreter falls back to PATH, then Homebrew on macOS", () => {
    const usrLocal = join("/usr", "local", "bin", "php");
    const custom = join("/custom", "bin", "php");
    const homebrew = join("/opt", "homebrew", "bin", "php");
    const lookup = (found: string[], PATH = ["relative", "/custom/bin"].join(delimiter)) => ({
      env: { PATH },
      exists: (path: string) => found.includes(path),
    });
    const php = (platform: string, found: string[], PATH?: string) =>
      resolveScriptCommand(argv(1), dir, "q", platform, lookup(found, PATH)).command;

    // `/usr/bin/php` is absent and an executable is on PATH.
    expect(php("darwin", [custom, homebrew])).toBe(custom);
    expect(php("linux", [custom])).toBe(custom);
    // Homebrew's prefixes are searched after PATH, on macOS only.
    expect(php("darwin", [homebrew, usrLocal], "")).toBe(homebrew);
    expect(php("darwin", [usrLocal], "")).toBe(usrLocal);
    expect(php("linux", [homebrew], "")).toBe("/usr/bin/php");
    // Relative PATH entries are never used.
    expect(php("linux", [join("relative", "php")])).toBe("/usr/bin/php");
    // A present fixed path wins; nothing found keeps it for a clear spawn error.
    expect(php("darwin", ["/usr/bin/php", custom])).toBe("/usr/bin/php");
    expect(php("darwin", [])).toBe("/usr/bin/php");
    // External scripts are never looked up.
    const external = resolveScriptCommand(
      { type: 8, scriptfile: "bin/echo-args.sh" },
      dir,
      "",
      "darwin",
      lookup([]),
    );
    expect(external.command).toBe(join(dir, "bin", "echo-args.sh"));
  });

  test("strips PHP tags for php -r", () => {
    const resolved = resolveScriptCommand({ type: 1, script: "<?php echo 1; ?>\n" }, dir, "");
    expect(resolved.args).toEqual(["-r", " echo 1; "]);
  });
});

describe("escapeQuery", () => {
  test("honours each bit of the mask", () => {
    const cases: [number, string, string][] = [
      [1, "a b", "a\\ b"],
      [2, "`x`", "\\`x\\`"],
      [4, '"x"', '\\"x\\"'],
      [8, "[a](b){c}", "\\[a\\]\\(b\\)\\{c\\}"],
      [16, "$x", "\\$x"],
      [32, "a\\b", "a\\\\b"],
      [64, "it's", "it\\'s"],
      [128, "a;b", "a\\;b"],
      [0, "a b$;", "a b$;"],
    ];
    for (const [mask, input, output] of cases) expect(escapeQuery(input, mask)).toBe(output);
  });

  test("escapes original backslashes exactly once", () => {
    expect(escapeQuery('\\"', 4 + 32)).toBe('\\\\\\"');
  });
});

describe("buildWorkflowEnv", () => {
  test("sets alfred_* variables and layers workflow variables", () => {
    const env = buildWorkflowEnv({
      workflow: workflow(),
      supportPath: "/data/com.example.wf",
      theme: "light",
      debug: true,
      preferences: { token: "secret", verbose: false },
      variables: { session: true, api: "override" },
      baseEnv: { PATH: "/bin", HOME: "/home/x" },
    });
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/home/x",
      alfred_version: "5.5",
      alfred_workflow_bundleid: "com.example.wf",
      alfred_workflow_name: "Example",
      alfred_workflow_uid: "user.workflow.ABC",
      alfred_workflow_version: "2.0",
      alfred_workflow_description: "Does things",
      alfred_workflow_data: "/data/com.example.wf",
      alfred_workflow_cache: join("/data/com.example.wf", "cache"),
      alfred_theme_background: "rgba(255,255,255,0.98)",
      alfred_debug: "1",
      api: "override",
      shared: "workflow",
      verbose: "0",
      token: "secret",
      session: "1",
    });
  });

  test("defaults: dark theme, debug off, explicit uid", () => {
    const env = buildWorkflowEnv({
      workflow: workflow(),
      supportPath: "/d",
      uid: "custom",
      baseEnv: {},
    });
    expect(env.alfred_theme_background).toBe("rgba(30,30,30,0.95)");
    expect(env.alfred_debug).toBe("0");
    expect(env.alfred_workflow_uid).toBe("custom");
    expect(env.verbose).toBe("1");
  });

  test("workflowVariables skips undefined layers", () => {
    expect(workflowVariables({ workflow: workflow(), variables: { api: undefined } }).api).toBe(
      "https://example.com",
    );
  });
});

describe.skipIf(!posix)("runWorkflowScript", () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", greeting: "hi" };

  test("argv mode passes arguments positionally, in the workflow folder", async () => {
    const result = await runWorkflowScript({
      config: {
        type: 0,
        scriptargtype: 1,
        script: 'printf "%s|%s|%s|%s|" "$1" "$2" "$#" "$greeting"; pwd -P',
      },
      workflowDir: dir,
      query: ["one two", "three"],
      env,
    });
    expect(result.stdout).toBe(`one two|three|2|hi|${await realpath(dir)}\n`);
    expect(result.exitCode).toBe(0);
    expect(result.aborted).toBe(false);
  });

  test("{query} mode substitutes into the script", async () => {
    const result = await runWorkflowScript({
      config: {
        type: 0,
        scriptargtype: 0,
        escaping: 4 + 16 + 32 + 2,
        script: 'printf "%s" "{query}"',
      },
      workflowDir: dir,
      query: 'say "$HOME" `x` \\n',
      env,
    });
    expect(result.stdout).toBe('say "$HOME" `x` \\n');
  });

  test("external scripts run with exit code and stderr", async () => {
    const result = await runWorkflowScript({
      config: { type: 8, scriptfile: "bin/echo-args.sh", scriptargtype: 1 },
      workflowDir: dir,
      query: ["a", "b c"],
      env,
    });
    expect(result.stdout).toBe("a|b c|");
    const failing = await runWorkflowScript({
      config: { type: 0, scriptargtype: 1, script: "echo oops >&2; exit 3" },
      workflowDir: dir,
      query: "",
      env,
    });
    expect(failing.exitCode).toBe(3);
    expect(failing.stderr).toBe("oops\n");
  });

  test("caps output and stops the script", async () => {
    const chunks: string[] = [];
    const result = await runWorkflowScript({
      config: { type: 0, scriptargtype: 1, script: "while :; do printf 0123456789; done" },
      workflowDir: dir,
      query: "",
      env,
      maxOutputBytes: 25,
      onStdout: (chunk) => chunks.push(chunk),
    });
    expect(result.truncated).toBe(true);
    expect(result.stdout).toBe("0123456789012345678901234");
    expect(chunks.join("")).toBe(result.stdout);
  });

  test("abort kills the whole process group", async () => {
    const controller = new AbortController();
    let grandchild = 0;
    // The background sleep inherits stdout, so the result only settles once
    // the signal reached the grandchild too, not just the shell.
    const result = await runWorkflowScript({
      config: { type: 0, scriptargtype: 1, script: "sleep 30 & echo $!; wait" },
      workflowDir: dir,
      query: "",
      env,
      signal: controller.signal,
      onStdout: (chunk) => {
        grandchild = Number.parseInt(chunk, 10);
        controller.abort();
      },
    });
    expect(result.aborted).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(grandchild).toBeGreaterThan(0);
  });

  test("escalates to SIGKILL when the group ignores SIGTERM", async () => {
    const controller = new AbortController();
    const result = await runWorkflowScript({
      config: {
        type: 0,
        scriptargtype: 1,
        script: "trap '' TERM; (trap '' TERM; sleep 30) & echo ready; wait",
      },
      workflowDir: dir,
      query: "",
      env,
      signal: controller.signal,
      killGraceMs: 20,
      onStdout: () => controller.abort(),
    });
    expect(result.aborted).toBe(true);
    expect(result.signal).toBe("SIGKILL");
  });

  test("a signal aborted before start never spawns", async () => {
    const result = await runWorkflowScript({
      config: { type: 0, scriptargtype: 1, script: "echo no" },
      workflowDir: dir,
      query: "",
      env,
      signal: AbortSignal.abort(),
    });
    expect(result).toMatchObject({ aborted: true, stdout: "" });
  });

  test("rejects with a named error when the interpreter is missing", async () => {
    await expect(
      runWorkflowScript({
        config: { type: 8, scriptfile: "bin/missing.sh" },
        workflowDir: dir,
        query: "",
        env,
      }),
    ).rejects.toThrow(/alfred: cannot run .*missing\.sh/);
  });
});
