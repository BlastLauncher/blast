// `captureException` and `captureMemorySnapshot` from the declarations. Raycast
// reports both to the Developer Hub; Blast has no network and writes to the
// runtime's log channel instead, which the host already collects per session.
// The sink is installed by the runtime entry, never by extension code.
import { format } from "node:util";

/** The log levels the protocol's `log` message carries. */
export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";
export type RuntimeLogSink = (level: RuntimeLogLevel, message: string) => void;

let sink: RuntimeLogSink | undefined;

/** Installs (or, with `undefined`, removes) the runtime log sink. */
export function setRuntimeLogSink(next: RuntimeLogSink | undefined): void {
  sink = next;
}

/**
 * Reports an exception. Without a sink (a bare module import in a test) this is
 * a no-op: reporting must never be the reason a command fails.
 */
export function captureException(exception: unknown): void {
  sink?.("error", `captureException: ${format(exception)}`);
}

/**
 * Records heap statistics with a label. Raycast only records when memory
 * reporting is enabled, so this stays at `debug` level: a client decides what
 * to keep, and nothing is returned to the extension.
 */
export function captureMemorySnapshot(label: string): void {
  const { heapUsed, heapTotal } = process.memoryUsage();
  sink?.("debug", `captureMemorySnapshot: ${label} heapUsed=${heapUsed} heapTotal=${heapTotal}`);
}
