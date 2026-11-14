import { describe, expect, test } from "bun:test";
import { acceptsRuntimePortRequest, isRuntimePortRequest } from "./runtime-port.ts";

describe("runtime port handshake", () => {
  test("recognizes only the sandbox request", () => {
    expect(isRuntimePortRequest({ type: "blast-port-request" })).toBe(true);
    expect(isRuntimePortRequest({ type: "blast-port" })).toBe(false);
    expect(isRuntimePortRequest(undefined)).toBe(false);
    expect(isRuntimePortRequest("blast-port-request")).toBe(false);
  });

  test("accepts one request from the active sandbox only", () => {
    const frame = {};
    expect(acceptsRuntimePortRequest(frame, frame, false, { type: "blast-port-request" })).toBe(
      true,
    );
    expect(acceptsRuntimePortRequest({}, frame, false, { type: "blast-port-request" })).toBe(false);
    expect(acceptsRuntimePortRequest(frame, frame, true, { type: "blast-port-request" })).toBe(
      false,
    );
  });
});
