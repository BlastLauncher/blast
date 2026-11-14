import { expect, test } from "bun:test";
import { isBrowserCatalogBlocked } from "./browser-catalog.ts";

test("browser catalog filter excludes native and process dependencies generically", () => {
  expect(isBrowserCatalogBlocked(["run-applescript"])).toBe(true);
  expect(isBrowserCatalogBlocked(["some-native-addon"])).toBe(true);
  expect(isBrowserCatalogBlocked(["react", "date-fns"])).toBe(false);
});
