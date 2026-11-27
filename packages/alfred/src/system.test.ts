import { describe, expect, test } from "bun:test";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  playSound,
  resolveSoundPath,
  runShortcut,
  speak,
  SYSTEM_SOUNDS_DIR,
  type SystemDeps,
} from "./system.ts";

type Spawned = { command: string; args: string[]; options: SpawnOptions; stdin: string[] };

/**
 * A `spawn` that never starts a process: `behave` sees the arguments (and may
 * write files) and returns the exit code, or an Error to emit instead.
 */
function fakeSpawn(
  behave: (args: string[]) => number | null | Error | Promise<number | null | Error> = () => 0,
) {
  const spawned: Spawned[] = [];
  const spawn = (command: string, args: string[], options: SpawnOptions): ChildProcess => {
    const record: Spawned = { command, args, options, stdin: [] };
    spawned.push(record);
    const child = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
      stdin: Object.assign(new EventEmitter(), {
        end: (text?: string) => void (text !== undefined && record.stdin.push(text)),
      }),
      killed: false,
      unref: () => {},
      kill: () => {
        child.killed = true;
        return true;
      },
    });
    void Promise.resolve()
      .then(() => behave(args))
      .then((outcome) => {
        if (outcome instanceof Error) child.emit("error", outcome);
        else {
          if (outcome !== 0) child.stderr.emit("data", Buffer.from("it broke\n"));
          child.emit("close", child.killed ? null : outcome, null);
        }
      });
    return child as unknown as ChildProcess;
  };
  return { spawned, spawn };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("resolveSoundPath", () => {
  test("system sounds live in the system folder; workflow sounds stay inside the workflow", () => {
    expect(resolveSoundPath({ soundName: "Glass", systemSound: true })).toBe(
      `${SYSTEM_SOUNDS_DIR}/Glass.aiff`,
    );
    expect(resolveSoundPath({ soundName: "Funk.aiff", systemSound: true })).toBe(
      `${SYSTEM_SOUNDS_DIR}/Funk.aiff`,
    );
    expect(
      resolveSoundPath({ soundName: "sounds/ding.mp3", systemSound: false, workflowDir: "/wf" }),
    ).toBe("/wf/sounds/ding.mp3");
  });

  test("names that escape their folder are rejected", () => {
    for (const soundName of ["../Glass", "a/b", "/etc/passwd", ".."]) {
      expect(() => resolveSoundPath({ soundName, systemSound: true })).toThrow(
        "invalid system sound",
      );
    }
    for (const soundName of ["../x.mp3", "a/../../x.mp3", "/etc/x.mp3", "."]) {
      expect(() => resolveSoundPath({ soundName, systemSound: false, workflowDir: "/wf" })).toThrow(
        "outside the workflow",
      );
    }
    expect(() => resolveSoundPath({ soundName: "x.mp3", systemSound: false })).toThrow(
      "needs a workflow folder",
    );
  });
});

const recording = (extra: Partial<SystemDeps> = {}) => {
  const warnings: string[] = [];
  const fake = fakeSpawn();
  return {
    warnings,
    fake,
    deps: {
      platform: "darwin",
      spawn: fake.spawn,
      exists: () => true,
      warn: (message: string) => void warnings.push(message),
      ...extra,
    } satisfies SystemDeps,
  };
};

describe("playSound and speak", () => {
  test("plays an existing sound with afplay without waiting for it", () => {
    const { deps: d, fake, warnings } = recording();
    playSound({ soundName: "Glass", systemSound: true }, d);
    expect(fake.spawned.map(({ command, args }) => [command, args])).toEqual([
      ["/usr/bin/afplay", [`${SYSTEM_SOUNDS_DIR}/Glass.aiff`]],
    ]);
    expect(fake.spawned[0]!.options.stdio).toEqual(["ignore", "ignore", "ignore"]);
    expect(warnings).toEqual([]);
  });

  test("missing sounds, bad names and other platforms only warn", () => {
    const missing = recording({ exists: () => false });
    playSound({ soundName: "Nope", systemSound: true }, missing.deps);
    const escaping = recording();
    playSound({ soundName: "../x", systemSound: false, workflowDir: "/wf" }, escaping.deps);
    const linux = recording({ platform: "linux" });
    playSound({ soundName: "Glass", systemSound: true }, linux.deps);
    speak("hello", linux.deps);
    expect([missing, escaping, linux].flatMap(({ fake }) => fake.spawned)).toEqual([]);
    expect([...missing.warnings, ...escaping.warnings, ...linux.warnings]).toEqual([
      `alfred: no sound at ${SYSTEM_SOUNDS_DIR}/Nope.aiff`,
      'alfred: sound "../x" is outside the workflow',
      "alfred: Play Sound needs macOS; this host runs linux",
      "alfred: Speak needs macOS; this host runs linux",
    ]);
  });

  test("speak pipes text to say so it never parses as flags", () => {
    const { deps: d, fake } = recording();
    speak("-v Zarvox hello", d);
    expect(fake.spawned).toMatchObject([
      { command: "/usr/bin/say", args: [], stdin: ["-v Zarvox hello"] },
    ]);
  });

  test("a spawn error is a warning, not a crash", async () => {
    const warnings: string[] = [];
    const fake = fakeSpawn(() => new Error("ENOENT"));
    speak("hi", { platform: "darwin", spawn: fake.spawn, warn: (m) => void warnings.push(m) });
    await flush();
    expect(warnings).toEqual(["alfred: cannot run /usr/bin/say: ENOENT"]);
  });
});

describe("runShortcut", () => {
  const request = { name: "Summarize", input: "some text", inputMode: 0, outputMode: 1 };

  test("passes input and reads output through temporary files, then removes them", async () => {
    let files: string[] = [];
    const fake = fakeSpawn(async (args) => {
      const input = args[args.indexOf("--input-path") + 1]!;
      const output = args[args.indexOf("--output-path") + 1]!;
      files = [input, output];
      await writeFile(output, `summary of ${await readFile(input, "utf8")}\n`);
      return 0;
    });
    const output = await runShortcut(request, { platform: "darwin", spawn: fake.spawn });
    expect(output).toBe("summary of some text\n");
    expect(fake.spawned[0]!.command).toBe("/usr/bin/shortcuts");
    expect(fake.spawned[0]!.args).toEqual([
      "run",
      "Summarize",
      "--input-path",
      files[0]!,
      "--output-path",
      files[1]!,
      "--output-type",
      "public.plain-text",
    ]);
    expect(dirname(files[0]!)).toBe(dirname(files[1]!));
    expect(existsSync(dirname(files[0]!))).toBe(false);
  });

  test("no input and ignored output add no file arguments", async () => {
    const fake = fakeSpawn();
    const output = await runShortcut(
      { ...request, input: "", outputMode: 0 },
      { platform: "darwin", spawn: fake.spawn },
    );
    expect(output).toBe("");
    expect(fake.spawned[0]!.args).toEqual(["run", "Summarize"]);
  });

  test("failures, odd names and other platforms are named errors", async () => {
    const failing = fakeSpawn(() => 1);
    await expect(
      runShortcut(request, { platform: "darwin", spawn: failing.spawn }),
    ).rejects.toThrow('shortcut "Summarize" exited with 1: it broke');
    const broken = fakeSpawn(() => new Error("ENOENT"));
    await expect(runShortcut(request, { platform: "darwin", spawn: broken.spawn })).rejects.toThrow(
      "cannot run /usr/bin/shortcuts: ENOENT",
    );
    await expect(
      runShortcut({ ...request, name: "--help" }, { platform: "darwin" }),
    ).rejects.toThrow('invalid shortcut name "--help"');
    await expect(runShortcut(request, { platform: "linux" })).rejects.toThrow(
      "alfred: Run Shortcut needs macOS; this host runs linux",
    );
  });

  test("an abort kills the Shortcut and rejects with AbortError", async () => {
    const controller = new AbortController();
    const fake = fakeSpawn(async () => {
      controller.abort();
      return 0;
    });
    const error = await runShortcut(
      { ...request, signal: controller.signal },
      { platform: "darwin", spawn: fake.spawn },
    ).catch((caught: Error) => caught);
    expect((error as Error).name).toBe("AbortError");
  });
});
