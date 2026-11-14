import { expect, test } from "bun:test";
import { createPromptController, type PromptForm } from "./prompt.ts";

const form: PromptForm = {
  title: "Set up Hello",
  submit: "Save & Launch",
  description: "Needed before the command runs.",
  sections: [
    {
      title: "Extension",
      fields: [
        { key: "token", type: "password", title: "Token", required: true },
        {
          key: "mode",
          type: "dropdown",
          title: "Mode",
          required: false,
          data: [
            { title: "Fast", value: "fast" },
            { title: "Slow", value: "slow" },
          ],
        },
        { key: "loud", type: "checkbox", title: "Loud", label: "Shout", required: false },
      ],
    },
    {
      title: "Command",
      fields: [{ key: "argument:who", type: "textfield", title: "Who", required: true }],
    },
  ],
  values: {},
};
const prompt = () => createPromptController({ platform: "Linux" });
const fields = (p: ReturnType<typeof prompt>) => p.view().form!.fields;

test("a form view shows every field with its start value and the submit title", () => {
  const p = prompt();
  p.form(form);
  const view = p.view();
  expect(view.kind).toBe("form");
  expect(view.title).toBe("Set up Hello");
  expect(view.primary).toMatchObject({ title: "Save & Launch", enabled: true });
  expect(view.navigation.canGoBack).toBe(true);
  expect(fields(p).map((f) => [f.id, f.type, f.title])).toEqual([
    ["token", "Form.PasswordField", "Token"],
    ["mode", "Form.Dropdown", "Mode"],
    ["loud", "Form.Checkbox", "Loud"],
    ["argument:who", "Form.TextField", "Who"],
  ]);
  expect(fields(p)[1]).toMatchObject({ selected: [{ value: "fast", title: "Fast" }] });
  expect(view.form!.items.map((item) => item.kind)).toEqual([
    "description",
    "separator",
    "description",
    "field",
    "field",
    "field",
    "separator",
    "description",
    "field",
  ]);
});

test("submitting with required values missing marks them and sends nothing", () => {
  const p = prompt();
  p.form(form);
  expect(p.input({ type: "submit" }).effects).toEqual([]);
  expect(fields(p).map((f) => f.error)).toEqual(["Required", "", "", "Required"]);
  p.input({ type: "setValue", id: "argument:who", value: "world" });
  expect(fields(p).map((f) => f.error)).toEqual(["Required", "", "", ""]);
});

test("filled values come back on submit; a password never appears in a view", () => {
  const p = prompt();
  p.form({ ...form, values: { "argument:who": "me" } });
  p.input({ type: "setValue", id: "token", value: "s3cret" });
  p.input({ type: "focus", id: "loud" });
  p.input({ type: "toggle", id: "loud" });
  p.input({ type: "focus", id: "mode" });
  p.input({ type: "optionMove", delta: 1 });
  p.input({ type: "optionChoose" });
  expect(JSON.stringify(p.view())).not.toContain("s3cret");
  expect(fields(p)[0]).toMatchObject({ hasValue: true, value: null });
  expect(p.input({ type: "primary" }).effects).toEqual([
    {
      type: "submit",
      values: { token: "s3cret", mode: "slow", loud: true, "argument:who": "me" },
    },
  ]);
});

test("back cancels from a form and from a status screen", () => {
  const p = prompt();
  p.form(form);
  expect(p.input({ type: "back" }).effects).toEqual([{ type: "cancel" }]);
  p.status({ title: "Hello", toast: { style: "animated", title: "Installing", message: "" } });
  expect(p.input({ type: "back" }).effects).toEqual([{ type: "cancel" }]);
});

test("an animated status is a loading view with a toast and no actions", () => {
  const p = prompt();
  p.status({
    title: "Hello",
    toast: { style: "animated", title: "Installing dependencies", message: "react" },
  });
  const view = p.view();
  expect(view).toMatchObject({ kind: "detail", title: "Hello", loading: true });
  expect(view.feedback.toast).toMatchObject({
    style: "animated",
    title: "Installing dependencies",
    message: "react",
    actions: [],
  });
  expect(view.primary.enabled).toBe(false);
  expect(p.input({ type: "primary" }).effects).toEqual([]);
});

test("a failure toast keeps its Retry action until the flow moves on", () => {
  const p = prompt();
  p.status({
    title: "Hello",
    toast: { style: "failure", title: "Install failed", message: "offline", retry: true },
  });
  expect(p.view().feedback.toast?.actions).toEqual([{ title: "Retry", shortcut: "R" }]);
  expect(p.view().loading).toBe(false);
  expect(p.input({ type: "toastAction", index: 0 }).effects).toEqual([{ type: "retry" }]);
  expect(p.input({ type: "primary" }).effects).toEqual([{ type: "retry" }]);
  expect(p.input({ type: "key", key: { name: "r" } }).effects).toEqual([{ type: "retry" }]);
});

test("subscribers hear each view the prompt shows", () => {
  const p = prompt();
  const kinds: string[] = [];
  p.subscribe((view) => kinds.push(view.kind));
  p.form(form);
  p.status({ title: "Hello", toast: { style: "animated", title: "Working", message: "" } });
  expect(kinds).toEqual(["form", "detail"]);
});
