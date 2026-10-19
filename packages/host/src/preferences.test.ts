import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreferenceStore, preferenceFile, parsePreferences, storageFile } from "./index.ts";

test("preferences isolate command values, preserve defaults and protect the file", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-preferences-"));
  const extensionName = "@scope/name";
  const store = () => createPreferenceStore({ dataDir, extensionName });
  try {
    await store().save({ shared: "extension", flag: false }, "one", {
      shared: "command",
      secret: "key",
    });
    await store().save({ flag: true }, "two", { choice: "b" });
    expect(await store().values("one")).toEqual({ shared: "command", flag: true, secret: "key" });
    expect(await store().values("two")).toEqual({ shared: "extension", flag: true, choice: "b" });
    const file = preferenceFile(dataDir, extensionName);
    expect(file).toBe(storageFile(dataDir, extensionName).replace("/storage/", "/preferences/"));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await writeFile(file, "{}");
    await expect(store().values("one")).rejects.toThrow("Invalid preferences file");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("parsePreferences preserves description and validates type", () => {
  const parsed = parsePreferences([
    {
      name: "api_key",
      type: "password",
      title: "API Key",
      description: "Enter your service API key",
      required: true,
    },
    {
      name: "theme",
      type: "textfield",
      title: "Theme",
    },
  ]);
  expect(parsed[0]!.description).toBe("Enter your service API key");
  expect(parsed[1]!.description).toBeUndefined();

  expect(() =>
    parsePreferences([
      {
        name: "bad",
        type: "textfield",
        title: "Bad",
        description: 123,
      },
    ]),
  ).toThrow('Preference "bad" needs a string "description"');
});
