// asciicast v2 (https://docs.asciinema.org/manual/asciicast/v2/): a JSON
// header line, then one `[seconds, "o", data]` line per output chunk. Shared
// by the recorder (`site:record-tui`) and the browser player, so it must stay
// free of Node APIs.

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
