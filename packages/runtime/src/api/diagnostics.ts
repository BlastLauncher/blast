// `captureException` and `captureMemorySnapshot` from the declarations. Raycast
// reports both to the Developer Hub; Blast has no network and writes to the
// runtime's log channel instead, which the host already collects per session.
// The sink is installed by the runtime entry, never by extension code.
function formatValue(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entry]) => `${key}: ${formatValue(entry)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return String(value);
}

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
  sink?.("error", `captureException: ${formatValue(exception)}`);
}

/**
 * Records heap statistics with a label. Raycast only records when memory
 * reporting is enabled, so this stays at `debug` level: a client decides what
 * to keep, and nothing is returned to the extension.
 */
export function captureMemorySnapshot(label: string): void {
  const memory = (
    globalThis as { process?: { memoryUsage?: () => { heapUsed: number; heapTotal: number } } }
  ).process?.memoryUsage?.();
  sink?.(
    "debug",
    `captureMemorySnapshot: ${label} heapUsed=${memory?.heapUsed ?? 0} heapTotal=${memory?.heapTotal ?? 0}`,
  );
}
