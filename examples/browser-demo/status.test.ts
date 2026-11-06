import { expect, test } from "bun:test";
import { statusError, statusForStage } from "./status.ts";
import { classifyBrowserOutcome } from "./browser-sweep.ts";

test("status model maps loading stages to footer copy", () => {
  expect(statusForStage("fetching").text).toBe("Fetching extension…");
  expect(statusForStage("installing").text).toBe("Installing…");
  expect(statusForStage("bundling").text).toBe("Bundling…");
  expect(statusForStage("starting").text).toBe("Starting…");
});

test("errors are marked for the footer error treatment", () => {
  expect(statusError("Unable to load")).toEqual({
    stage: "error",
    text: "Unable to load",
    error: true,
  });
});

test("a ready status does not hide the actual page error", () => {
  expect(
    classifyBrowserOutcome({
      status: "Ready",
      pageErrors: ["hn.types.isBoxedPrimitive is not a function"],
    }),
  ).toBe("runtime-error:hn.types.isBoxedPrimitive is not a function");
});
