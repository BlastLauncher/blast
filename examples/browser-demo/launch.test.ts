import { expect, test } from "bun:test";
import { BrowserLaunchTimeoutError, withLaunchTimeout } from "./launch.ts";

test("a launch that does not settle gets a typed timeout", async () => {
  const error = await withLaunchTimeout(new Promise<never>(() => {}), 1).catch((value) => value);
  expect(error).toBeInstanceOf(BrowserLaunchTimeoutError);
  expect((error as BrowserLaunchTimeoutError).code).toBe("BROWSER_LAUNCH_TIMEOUT");
});
