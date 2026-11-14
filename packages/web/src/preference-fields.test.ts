import { expect, test } from "bun:test";
import {
  missingPreferences,
  parsePreferences,
  preferenceDefaults,
  preferenceFields,
  preferenceValues,
} from "./preference-fields.ts";

const extension = parsePreferences([
  { name: "shared", type: "textfield", default: "extension" },
  { name: "required", type: "password", required: true },
]);
const command = parsePreferences([
  { name: "shared", type: "textfield", default: "command" },
  { name: "choice", type: "dropdown", default: "one", data: [{ title: "One", value: "one" }] },
]);

test("preference fields apply defaults, command overrides, deduplicate, and detect missing", () => {
  expect(preferenceDefaults(extension, command)).toEqual({ shared: "command", choice: "one" });
  expect(preferenceValues({ shared: "stored" }, { run: { shared: "command" } }, "run")).toEqual({
    shared: "command",
  });
  expect(preferenceFields(extension, command).map((field) => field.name)).toEqual([
    "shared",
    "required",
    "choice",
  ]);
  expect(
    missingPreferences(preferenceFields(extension, command), { required: "" }).map(
      (field) => field.name,
    ),
  ).toEqual(["required"]);
  expect(
    missingPreferences(preferenceFields(extension, command), {}).map((field) => field.name),
  ).toEqual(["required"]);
});
