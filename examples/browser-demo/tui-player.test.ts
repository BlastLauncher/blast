import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { join } from "node:path";
import { Ghostty } from "ghostty-web";
import { createTheme } from "../../packages/tui/src/theme.ts";
import {
  createPlayback,
  parseCast,
  scriptToCast,
  tuiTerminalTheme,
  type Cast,
  type CastHeader,
} from "./tui-cast.ts";

const castPath = join(import.meta.dir, "recordings/tui.cast");
const castText = readFileSync(castPath, "utf8");
const header: CastHeader = { version: 2, width: 10, height: 2 };
const encode = (text: string) => new TextEncoder().encode(text);

/** Replays `cast` in ghostty's own VT parser and returns every frame's screen text. */
async function frames(cast: Cast): Promise<string[]> {
  const terminal = (await Ghostty.load()).createTerminal(cast.header.width, cast.header.height);
  const screens: string[] = [];
  try {
    for (const event of cast.events) {
      terminal.write(event.data);
      terminal.update();
      const rows: string[] = [];
      for (let row = 0; row < cast.header.height; row++)
        rows.push(
          (terminal.getLine(row) ?? [])
            .map((cell) => (cell.codepoint ? String.fromCodePoint(cell.codepoint) : " "))
            .join("")
            .trimEnd(),
        );
      screens.push(rows.join("\n"));
    }
  } finally {
    terminal.free();
  }
  return screens;
}

describe("the committed blast-tui recording", () => {
  test("is asciicast v2 at 100×28 with monotonic times, under 300 KB", () => {
    const lines = castText.trimEnd().split("\n");
    expect(JSON.parse(lines[0]!)).toMatchObject({ version: 2, width: 100, height: 28 });
    const times = lines.slice(1).map((line) => (JSON.parse(line) as [number])[0]);
    expect(times.length).toBeGreaterThan(20);
    expect(times.every((time, index) => index === 0 || time >= times[index - 1]!)).toBe(true);
    expect(parseCast(castText).duration).toBe(times.at(-1)!);
    expect(Buffer.byteLength(castText)).toBeLessThan(300 * 1024);
  });

  test("names no home path, host or user", () => {
    expect(castText).not.toContain("/home/");
    expect(castText).not.toContain("/Users/");
    expect(castText).not.toContain("/tmp/");
    // On the recording machine this is the machine that recorded it.
    for (const name of [hostname(), userInfo().username])
      if (name.length >= 3) expect(castText).not.toContain(name);
  });

  test("shows both scenes, ending with the renamed window in the status line", async () => {
    const screens = await frames(parseCast(castText));
    const split = screens.findIndex((screen) => screen.includes("Split Vertical"));
    const rename = screens.findIndex((screen) => screen.includes("Rename Window"));
    expect(split).toBeGreaterThanOrEqual(0);
    expect(rename).toBeGreaterThan(split);
    const last = screens.at(-1)!.split("\n");
    expect(last.at(-1)).toContain("0:engine");
    // Split Vertical left two panes, divided by a full-width rule.
    expect(last.some((row) => /^─{100}$/.test(row))).toBe(true);
    expect(last.filter((row) => row.startsWith("~/engine $"))).toHaveLength(2);
  });
});

describe("scriptToCast", () => {
  test("skips the script header, trims idle gaps and stops at the cut", () => {
    const log = encode("Script started on 2026-01-01 [TERM=xterm]\nabcdefDONE\nScript done\n");
    const cast = parseCast(scriptToCast("0.5 3\n4.0 3\n0.2 4\n", log, header, 1.5, 4.6));
    expect(cast.header).toEqual(header);
    expect(cast.events).toEqual([
      { time: 0.5, data: "abc" },
      { time: 2, data: "def" },
    ]);
  });

  test("keeps a character split across chunks whole", () => {
    const bytes = encode("x\n→");
    const cast = parseCast(scriptToCast("0.1 2\n0.1 1\n", bytes, header));
    expect(cast.events.map((event) => event.data).join("")).toBe("→");
  });

  test("drops sequences that ghostty-web cannot replay", () => {
    const log = encode("x\n\x1b]12;#ffffff\x07a\x1b]112\x07b\x1b[?7727hc\x1b[?1049h");
    const cast = parseCast(scriptToCast(`0.1 ${log.length - 2}\n`, log, header));
    expect(cast.events[0]!.data).toBe("abc\x1b[?1049h");
  });
});

describe("parseCast", () => {
  test("rejects a header that is not asciicast v2", () => {
    expect(() => parseCast('{"version":1,"width":80,"height":24}\n')).toThrow("asciicast v2");
    expect(() => parseCast('{"version":2,"width":0,"height":24}\n')).toThrow("asciicast v2");
  });

  test("rejects time going backwards and ignores input events", () => {
    const head = JSON.stringify(header);
    expect(() => parseCast(`${head}\n[1,"o","a"]\n[0.5,"o","b"]\n`)).toThrow("back in time");
    expect(parseCast(`${head}\n[1,"i","x"]\n[2,"o","b"]\n`)).toEqual({
      header,
      events: [{ time: 2, data: "b" }],
      duration: 2,
    });
  });
});

const recorder = () => {
  const calls: string[] = [];
  return {
    calls,
    screen: { write: (data: string) => calls.push(data), reset: () => calls.push("reset") },
  };
};

describe("createPlayback", () => {
  const cast: Cast = {
    header,
    events: [
      { time: 0, data: "a" },
      { time: 1, data: "b" },
      { time: 1.5, data: "c" },
    ],
    duration: 1.5,
  };
  test("writes events as the playhead passes them, then holds and starts over", () => {
    const { calls, screen } = recorder();
    const playback = createPlayback(cast, screen, 2);
    playback.advance(0.5);
    expect(calls).toEqual(["a"]);
    playback.advance(1);
    expect(calls).toEqual(["a", "bc"]);
    expect(playback.progress).toBe(1);
    playback.advance(1.9);
    expect(calls).toEqual(["a", "bc"]);
    playback.advance(0.2);
    expect(calls).toEqual(["a", "bc", "reset", "a"]);
    expect(playback.progress).toBe(0);
  });

  test("finish shows the last frame and playing on restarts at once", () => {
    const { calls, screen } = recorder();
    const playback = createPlayback(cast, screen, 2);
    playback.finish();
    expect(calls).toEqual(["abc"]);
    expect(playback.progress).toBe(1);
    playback.advance(0.01);
    expect(calls).toEqual(["abc", "reset", "a"]);
  });
});

test("the terminal theme is the TUI's dark palette", () => {
  const { colors } = createTheme(false, "dark");
  expect(tuiTerminalTheme).toMatchObject({
    background: colors.background,
    foreground: colors.text,
    cursor: colors.accent,
    selectionBackground: colors.selectionBg,
    selectionForeground: colors.selectionFg,
    black: colors.border,
    red: colors.danger,
    green: colors.success,
    yellow: colors.warning,
    blue: colors.accent,
    magenta: colors.magenta,
    brightBlack: colors.textMuted,
    brightMagenta: colors.purple,
  });
});
