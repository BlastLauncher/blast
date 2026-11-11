import { expect, test } from "bun:test";
import { BrowserLaunchTimeoutError, createLaunchGeneration, withLaunchTimeout } from "./launch.ts";

test("a launch that does not settle gets a typed timeout", async () => {
  const error = await withLaunchTimeout(new Promise<never>(() => {}), 1).catch((value) => value);
  expect(error).toBeInstanceOf(BrowserLaunchTimeoutError);
  expect((error as BrowserLaunchTimeoutError).code).toBe("BROWSER_LAUNCH_TIMEOUT");
  expect((error as BrowserLaunchTimeoutError).message).toContain("waiting for runtime port");
});

test("a newer launch invalidates an older generation", () => {
  const launches = createLaunchGeneration();
  const first = launches.next();
  const second = launches.next();
  expect(launches.isCurrent(first)).toBe(false);
  expect(launches.isCurrent(second)).toBe(true);
});
