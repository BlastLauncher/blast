// asciicast v2 (https://docs.asciinema.org/manual/asciicast/v2/): a JSON
// header line, then one `[seconds, "o", data]` line per output chunk. Shared
// by the recorder (`site:record-tui`) and the browser player, so it must stay
// free of Node and DOM APIs; tests replay casts with it headless.

export type CastHeader = {
  version: 2;
  width: number;
  height: number;
  env?: Record<string, string>;
  title?: string;
};
export type CastEvent = { time: number; data: string };
export type Cast = { header: CastHeader; events: CastEvent[]; duration: number };

export function parseCast(text: string): Cast {
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.length) throw new Error("cast is empty");
  const header = JSON.parse(lines[0]!) as CastHeader;
  if (
    header.version !== 2 ||
    !Number.isInteger(header.width) ||
    !Number.isInteger(header.height) ||
    header.width <= 0 ||
    header.height <= 0
  )
    throw new Error("cast header must be asciicast v2 with a positive integer width and height");
  const events: CastEvent[] = [];
  let previous = 0;
  for (const [index, line] of lines.slice(1).entries()) {
    const event = JSON.parse(line) as unknown;
    if (
      !Array.isArray(event) ||
      typeof event[0] !== "number" ||
      typeof event[2] !== "string" ||
      !Number.isFinite(event[0])
    )
      throw new Error(`cast event ${index + 1} is not [time, type, data]`);
    if (event[0] < previous)
      throw new Error(`cast event ${index + 1} goes back in time (${event[0]} < ${previous})`);
    previous = event[0];
    // Input ("i") and marker events carry no output to replay.
    if (event[1] === "o") events.push({ time: event[0], data: event[2] });
  }
  return { header, events, duration: previous };
}

/**
 * Sequences the attached tmux client sends that change nothing on a replayed
 * screen and that ghostty-web logs a console warning for: the cursor colour
 * (OSC 12 / OSC 112) and tmux's private mode 7727.
 */
// oxlint-disable-next-line no-control-regex -- terminal escape sequences start with ESC
const unreplayable = /\x1b\](?:12;[^\x07\x1b]*|112)(?:\x07|\x1b\\)|\x1b\[\?7727[hl]/g;

/**
 * Converts util-linux `script -T <timing> -O <log>` output (classic timing:
 * one `<delay> <bytes>` line per chunk) into an asciicast v2 document. Gaps
 * longer than `maxIdle` seconds shrink to `maxIdle`; output after `until`
 * seconds of recording (before shrinking) is dropped.
 */
export function scriptToCast(
  timing: string,
  log: Uint8Array,
  header: CastHeader,
  maxIdle = 1.5,
  until = Infinity,
): string {
  // The log starts with a "Script started on <date> [...]" line that is not
  // part of the recorded output, and ends with a "Script done" line that the
  // timing file does not cover.
  let offset = log.indexOf(0x0a) + 1;
  const decoder = new TextDecoder("utf-8");
  const lines = [JSON.stringify(header)];
  let time = 0,
    recorded = 0;
  for (const line of timing.split("\n")) {
    const match = line.trim().match(/^(\d+(?:\.\d+)?) (\d+)$/);
    if (!match) continue;
    recorded += Number(match[1]);
    if (recorded > until) break;
    time += Math.min(Number(match[1]), maxIdle);
    const length = Number(match[2]);
    // A chunk can end inside a multi-byte character; `stream` carries it over.
    const data = decoder
      .decode(log.subarray(offset, offset + length), { stream: true })
      .replace(unreplayable, "");
    offset += length;
    if (data) lines.push(JSON.stringify([Number(time.toFixed(4)), "o", data]));
  }
  return `${lines.join("\n")}\n`;
}

/** The TUI's dark palette (`packages/tui/src/theme.ts`) as a terminal theme. */
export const tuiTerminalTheme = {
  background: "#181825",
  foreground: "#cdd6f4",
  cursor: "#89b4fa",
  cursorAccent: "#181825",
  selectionBackground: "#313244",
  selectionForeground: "#cdd6f4",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#6c7086",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#cba6f7",
  brightCyan: "#94e2d5",
  brightWhite: "#cdd6f4",
} as const;

/** Seconds the last frame stays up before the recording starts over. */
export const loopHold = 2;

export type Screen = { write(data: string): void; reset(): void };
export type Playback = {
  /** 0–1 through the recording; 1 while holding the last frame. */
  readonly progress: number;
  /** Moves the playhead forward and writes every event it passes. */
  advance(seconds: number): void;
  /** Writes everything left (the last frame, without playback). */
  finish(): void;
};

/** The replay clock, apart from the DOM so it can be tested headless. */
export function createPlayback(cast: Cast, screen: Screen, hold = loopHold): Playback {
  let index = 0,
    position = 0;
  const flush = () => {
    let chunk = "";
    while (index < cast.events.length && cast.events[index]!.time <= position)
      chunk += cast.events[index++]!.data;
    if (chunk) screen.write(chunk);
  };
  return {
    get progress() {
      return cast.duration ? Math.min(1, position / cast.duration) : 1;
    },
    advance(seconds) {
      position += seconds;
      if (index >= cast.events.length && position >= cast.duration + hold) {
        screen.reset();
        index = 0;
        position = 0;
      }
      flush();
    },
    finish() {
      // Past the hold, so playing on starts the recording over at once.
      position = cast.duration + hold;
      flush();
    },
  };
}
