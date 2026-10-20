import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import { formFields, formOptions, nextField, parseDate } from "./form-view.ts";

const node = (type: string, id: string, children: SceneNode[] = []): SceneNode => ({
  type,
  id,
  props: {},
  children,
});
test("focus skips presentation fields and wraps in both directions", () => {
  const fields = formFields(
    node("Form", "form", [
      node("Form.Description", "help"),
      node("Form.TextField", "a"),
      node("Slot", "actions"),
      node("Form.TextArea", "b"),
    ]),
  );
  expect(fields.map((field) => field.id)).toEqual(["a", "b"]);
  expect(nextField(fields, "a", -1)?.id).toBe("b");
  expect(nextField(fields, "b", 1)?.id).toBe("a");
  expect(nextField([], undefined, 1)).toBeUndefined();
});
test("picker options include section children", () => {
  expect(
    formOptions(
      node("Form.Dropdown", "d", [
        node("Form.Dropdown.Section", "s", [node("Form.Dropdown.Item", "tea")]),
      ]),
    ).map((item) => item.id),
  ).toEqual(["tea"]);
});
test("ISO dates validate calendar days, times and empty input", () => {
  expect(parseDate("")).toBeNull();
  expect(parseDate("2024-02-29")).toBe("2024-02-29T00:00:00.000Z");
  expect(parseDate("2024-02-29T12:30:00Z")).toBe("2024-02-29T12:30:00.000Z");
  for (const value of [
    "2023-02-29",
    "2024-02-30",
    "2024-13-01",
    "yesterday",
    "2024-01-01T29:00",
    "2024-",
  ])
    expect(parseDate(value)).toBeUndefined();
});
