import { afterEach, expect, test } from "bun:test";
import {
  captureException,
  captureMemorySnapshot,
  setRuntimeLogSink,
  type RuntimeLogLevel,
} from "./index.ts";

afterEach(() => setRuntimeLogSink(undefined));

// @covers captureException
// @covers RuntimeLogLevel
test("captureException reports through the runtime log channel and never throws", () => {
  const logs: Array<[RuntimeLogLevel, string]> = [];
  setRuntimeLogSink((level, message) => logs.push([level, message]));
  captureException(new Error("command failed"));
  captureException("plain failure");
  captureException({ code: 7 });
  expect(logs).toEqual([
    ["error", "captureException: Error: command failed"],
    ["error", "captureException: plain failure"],
    ["error", "captureException: { code: 7 }"],
  ]);
  // Reporting must work with no sink installed: a bare import has no runtime.
  setRuntimeLogSink(undefined);
  expect(() => captureException(new Error("unreported"))).not.toThrow();
});

// @covers captureMemorySnapshot
test("captureMemorySnapshot logs the label with heap statistics and returns nothing", () => {
  const logs: Array<[RuntimeLogLevel, string]> = [];
  setRuntimeLogSink((level, message) => logs.push([level, message]));
  expect(captureMemorySnapshot("After parsing response")).toBeUndefined();
  expect(logs).toHaveLength(1);
  const [level, message] = logs[0]!;
  // Raycast only records with memory reporting on, so Blast logs at debug level.
  expect(level).toBe("debug");
  expect(message).toStartWith("captureMemorySnapshot: After parsing response heapUsed=");
  expect(message).toContain(" heapTotal=");
  setRuntimeLogSink(undefined);
  expect(() => captureMemorySnapshot("Unreported")).not.toThrow();
});
