// `node @blastlauncher/alfred/main`: one Alfred workflow command per process,
// speaking protocol v1 NDJSON over stdio (decision 0021).

import { createLineDecoder, encodeMessage, type LogLevel } from "@blastlauncher/protocol";
import { format } from "node:util";
import { startAlfredRuntime } from "./runtime.ts";

let stopping = false;
const protocolWrite = process.stdout.write.bind(process.stdout);
function log(level: LogLevel, args: unknown[]): void {
  if (!stopping) protocolWrite(encodeMessage({ type: "log", level, message: format(...args) }));
}
// Stdout is the protocol stream; stray console output becomes log messages.
for (const [method, level] of [
  ["log", "info"],
  ["info", "info"],
  ["debug", "debug"],
  ["warn", "warn"],
  ["error", "error"],
] as const) {
  console[method] = (...args: unknown[]) => log(level, args);
}

// `runtime` is only read from stdin callbacks, after this assignment.
const runtime = startAlfredRuntime({
  send(message) {
    protocolWrite(encodeMessage(message));
  },
  onMessage(listener) {
    // The protocol decoder enforces the line cap, strict UTF-8 and framing rules.
    const decoder = createLineDecoder({
      onLine: listener,
      onError: (error) => runtime.fatal(error, "PROTOCOL_ERROR"),
    });
    const onData = (chunk: Buffer) => decoder.push(chunk);
    process.stdin.on("data", onData);
    process.stdin.on("end", () => {
      decoder.end();
      runtime();
    });
    return () => process.stdin.off("data", onData);
  },
  exit(code) {
    stopping = true;
    process.stdin.pause();
    process.stdout.end(() => process.exit(code));
  },
  log,
});
process.on("uncaughtException", (error) => runtime.fatal(error));
process.on("unhandledRejection", (error) => runtime.fatal(error));
process.stdin.on("error", (error) => runtime.fatal(error));
// EPIPE means the host closed our stdout: a normal shutdown, not a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  process.exit(1);
});
