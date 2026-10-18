import { expect, test } from "bun:test";
import { createElement as h, useState } from "react";
import { createSceneRoot, type SceneNode, type SceneSnapshot } from "../reconciler/index.ts";
import { Action, ActionPanel, Form } from "./index.ts";
import type { FormEvent, FormValue, FormValues } from "./form.ts";

// @covers Form.TextField partial
// @covers Form.TextField.Props.id
// @covers Form.TextField.Props.title
// @covers Form.TextField.Props.info
// @covers Form.TextField.Props.error
// @covers Form.TextField.Props.storeValue partial
// @covers Form.TextField.Props.autoFocus
// @covers Form.TextField.Props.value
// @covers Form.TextField.Props.defaultValue
// @covers Form.TextField.Props.onChange
// @covers Form.TextField.Props.onBlur
// @covers Form.TextField.Props.onFocus
// @covers Form.TextArea partial
// @covers Form.TextArea.Props.id
// @covers Form.TextArea.Props.title
// @covers Form.TextArea.Props.info
// @covers Form.TextArea.Props.error
// @covers Form.TextArea.Props.storeValue partial
// @covers Form.TextArea.Props.autoFocus
// @covers Form.TextArea.Props.value
// @covers Form.TextArea.Props.defaultValue
// @covers Form.TextArea.Props.onChange
// @covers Form.TextArea.Props.onBlur
// @covers Form.TextArea.Props.onFocus
// @covers Form.Checkbox partial
// @covers Form.Checkbox.Props.id
// @covers Form.Checkbox.Props.title
// @covers Form.Checkbox.Props.info
// @covers Form.Checkbox.Props.error
// @covers Form.Checkbox.Props.storeValue partial
// @covers Form.Checkbox.Props.autoFocus
// @covers Form.Checkbox.Props.value
// @covers Form.Checkbox.Props.defaultValue
// @covers Form.Checkbox.Props.onChange
// @covers Form.Checkbox.Props.onBlur
// @covers Form.Checkbox.Props.onFocus
// @covers Form.DatePicker partial
// @covers Form.DatePicker.Props.id
// @covers Form.DatePicker.Props.title
// @covers Form.DatePicker.Props.info
// @covers Form.DatePicker.Props.error
// @covers Form.DatePicker.Props.storeValue partial
// @covers Form.DatePicker.Props.autoFocus
// @covers Form.DatePicker.Props.value
// @covers Form.DatePicker.Props.defaultValue
// @covers Form.DatePicker.Props.onChange
// @covers Form.DatePicker.Props.onBlur
// @covers Form.DatePicker.Props.onFocus
// @covers Form.Dropdown partial
// @covers Form.Dropdown.Props.id
// @covers Form.Dropdown.Props.title
// @covers Form.Dropdown.Props.info
// @covers Form.Dropdown.Props.error
// @covers Form.Dropdown.Props.storeValue partial
// @covers Form.Dropdown.Props.autoFocus
// @covers Form.Dropdown.Props.value
// @covers Form.Dropdown.Props.defaultValue
// @covers Form.Dropdown.Props.onChange
// @covers Form.Dropdown.Props.onBlur
// @covers Form.Dropdown.Props.onFocus
// @covers Form partial
// @covers Form.Props.actions
// @covers Form.Props.children
// @covers Form.Props.navigationTitle
// @covers Form.Props.isLoading
// @covers Form.Props.searchBarAccessory
// @covers Form.TextField.Props.placeholder
// @covers Form.TextArea.Props.placeholder
// @covers Form.TextArea.Props.enableMarkdown
// @covers Form.DatePicker.Props.type
// @covers Form.DatePicker.Props.min
// @covers Form.DatePicker.Props.max
// @covers Form.DatePicker.Type
// @covers Form.Dropdown.Props.children
// @covers Form.Dropdown.Props.placeholder
// @covers Form.Dropdown.Props.isLoading
// @covers Form.Dropdown.Props.throttle
// @covers Form.Dropdown.Props.filtering partial
// @covers Form.Dropdown.Props.onSearchTextChange partial
// @covers Form.Dropdown.Item
// @covers Form.Dropdown.Item.Props.value
// @covers Form.Dropdown.Item.Props.title
// @covers Form.Dropdown.Item.Props.icon
// @covers Form.Dropdown.Item.Props.keywords
// @covers Form.Dropdown.Section
// @covers Form.Dropdown.Section.Props.title
// @covers Form.Dropdown.Section.Props.children
// @covers Form.Checkbox.Props.label
// @covers Form.Description
// @covers Form.Description.Props.title
// @covers Form.Description.Props.text
// @covers Form.Separator
// @covers Action.SubmitForm partial
// @covers Action.SubmitForm.Props.title
// @covers Action.SubmitForm.Props.icon
// @covers Action.SubmitForm.Props.shortcut
// @covers Action.SubmitForm.Props.style
// @covers Action.SubmitForm.Props.onSubmit partial

function setup() {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  function nodes(node: SceneNode = scene.root!): SceneNode[] {
    return [node, ...node.children.flatMap((child) => nodes(child))];
  }
  function find(id: string) {
    return nodes().find((node) => node.props.id === id)!;
  }
  function submit() {
    const node = nodes().find((candidate) => candidate.type === "Action.SubmitForm")!;
    return root.dispatch(node.id, "onAction", []);
  }
  function change(id: string, value: unknown) {
    root.dispatch(find(id).id, "onChange", [value]);
    root.flush();
  }
  return { root, nodes, find, submit, change };
}

test("controlled values stay authoritative, uncontrolled edits survive rerenders, and submit is typed", () => {
  const { root, find, change, submit, nodes } = setup();
  let submitted: FormValues = {};
  function Command({ show = true, defaultValue = "original" }) {
    const [text, setText] = useState("controlled");
    return h(
      Form,
      {
        actions: h(
          ActionPanel,
          null,
          h(Action.SubmitForm, {
            onSubmit: (values) => {
              submitted = values;
              return false;
            },
          }),
        ),
      },
      h(Form.TextField, { id: "name", value: text, defaultValue: "ignored", onChange: setText }),
      h(Form.TextField, { id: "fixed", value: "fixed" }),
      show && h(Form.TextArea, { id: "notes", defaultValue }),
      h(
        Form.Dropdown,
        { id: "drink" },
        h(
          Form.Dropdown.Section,
          { title: "Drinks" },
          h(Form.Dropdown.Item, { value: "tea", title: "Tea" }),
          h(Form.Dropdown.Item, { value: "water", title: "Water" }),
        ),
      ),
      h(Form.Checkbox, { id: "agree", label: "Agree" }),
      h(Form.DatePicker, { id: "date" }),
    );
  }
  root.render(h(Command));
  expect(find("drink").props.value).toBe("tea");
  expect(find("date").props.value).toBeNull();
  change("name", "Ada");
  change("fixed", "ignored");
  change("notes", "edited");
  change("drink", "water");
  change("agree", true);
  change("date", "2026-10-18T12:00:00.000Z");
  root.render(h(Command, { defaultValue: "replacement" }));
  expect(find("notes").props.value).toBe("edited");
  expect(find("fixed").props.value).toBe("fixed");
  expect(find("date").props.value).toBe("2026-10-18T12:00:00.000Z");
  expect(submit()).toBe(false);
  expect(submitted).toEqual({
    name: "Ada",
    fixed: "fixed",
    notes: "edited",
    drink: "water",
    agree: true,
    date: new Date("2026-10-18T12:00:00.000Z"),
  });
  expect(nodes().find((node) => node.type === "Slot")?.props.name).toBe("actions");
  root.render(h(Command, { show: false }));
  submit();
  expect(submitted).not.toHaveProperty("notes");
  root.unmount();
});

test("all fields carry presentation props, errors, and focus events with runtime values", async () => {
  const { root, find, nodes, change, submit } = setup();
  const events: FormEvent<FormValue>[] = [];
  const changes: unknown[] = [];
  const common = {
    title: "Title",
    info: "Info",
    error: "Required",
    storeValue: true,
    autoFocus: true,
    onFocus: (event: FormEvent<FormValue>) => events.push(event),
    onBlur: (event: FormEvent<FormValue>) => events.push(event),
  };
  const bounds = { min: new Date("2020-01-01Z"), max: new Date("2030-01-01Z") };
  root.render(
    h(
      Form,
      {
        navigationTitle: "Example",
        isLoading: true,
        searchBarAccessory: h("Accessory"),
        actions: h(Action.SubmitForm, {
          title: "Save",
          icon: "check",
          style: "destructive",
          shortcut: { modifiers: ["cmd"], key: "s" },
          onSubmit: async () => true,
        }),
      },
      h(Form.TextField, {
        ...common,
        id: "text",
        defaultValue: "text",
        placeholder: "Name",
        onChange: (v) => changes.push(v),
      }),
      h(Form.TextArea, {
        ...common,
        id: "area",
        value: "area",
        defaultValue: "unused",
        enableMarkdown: true,
        placeholder: "Notes",
        onChange: (v) => changes.push(v),
      }),
      h(Form.Checkbox, {
        ...common,
        id: "check",
        value: false,
        defaultValue: true,
        label: "Agree",
        onChange: (v) => changes.push(v),
      }),
      h(Form.DatePicker, {
        ...common,
        ...bounds,
        id: "date",
        value: null,
        defaultValue: bounds.min,
        type: Form.DatePicker.Type.DateTime,
        onChange: (v) => changes.push(v),
      }),
      h(
        Form.Dropdown,
        {
          ...common,
          id: "drop",
          value: "one",
          defaultValue: "two",
          placeholder: "Pick",
          filtering: { keepSectionOrder: true },
          isLoading: true,
          throttle: true,
          onSearchTextChange: (text) => text,
          onChange: (v) => changes.push(v),
        },
        h(
          Form.Dropdown.Section,
          { title: "Section" },
          h(Form.Dropdown.Item, { value: "one", title: "One", icon: "star", keywords: ["first"] }),
        ),
      ),
      h(Form.Description, { title: "About", text: "Description" }),
      h(Form.Separator, {}),
    ),
  );
  for (const id of ["text", "area", "check", "date", "drop"]) {
    expect(find(id).props).toMatchObject({
      title: "Title",
      info: "Info",
      error: "Required",
      storeValue: true,
      autoFocus: true,
    });
    root.dispatch(find(id).id, "onFocus", []);
    root.dispatch(find(id).id, "onBlur", []);
    expect(events.slice(-2)).toEqual(
      (["focus", "blur"] as const).map((type) => ({
        type,
        target: { id, value: (id === "date" ? null : find(id).props.value) as FormValue },
      })),
    );
  }
  change("text", "changed");
  change("area", "new");
  change("check", true);
  change("date", "2026-01-01T00:00:00.000Z");
  change("drop", "two");
  expect(changes).toEqual(["changed", "new", true, new Date("2026-01-01T00:00:00.000Z"), "two"]);
  expect(find("date").props).toMatchObject({
    min: bounds.min.toISOString(),
    max: bounds.max.toISOString(),
    type: "date_time",
  });
  expect(Form.DatePicker.Type.Date).toBe("date");
  expect(root.dispatch(find("drop").id, "onSearchTextChange", ["query"])).toBe("query");
  expect(nodes().find((n) => n.type === "Form.TextArea")?.props).toMatchObject({
    enableMarkdown: true,
    placeholder: "Notes",
  });
  expect(nodes().find((n) => n.type === "Form.Dropdown.Item")?.props).toEqual({
    value: "one",
    title: "One",
    icon: "star",
    keywords: ["first"],
  });
  expect(nodes().find((n) => n.type === "Form.Description")?.props).toEqual({
    title: "About",
    text: "Description",
  });
  expect(nodes().some((n) => n.type === "Form.Separator")).toBe(true);
  expect(nodes().some((n) => n.type === "Slot" && n.props.name === "searchBarAccessory")).toBe(
    true,
  );
  await expect(submit()).resolves.toBe(true);
  root.unmount();
});

test("form instances isolate identical ids and uncontrolled defaults include false and null", () => {
  const { root, nodes } = setup();
  const values: FormValues[] = [];
  const makeForm = (text: string) =>
    h(
      Form,
      {
        actions: h(Action.SubmitForm, {
          onSubmit: (input) => {
            values.push(input);
          },
        }),
      },
      h(Form.TextField, { id: "text", defaultValue: text }),
      h(Form.Checkbox, { id: "check", label: "Check", defaultValue: false }),
      h(Form.DatePicker, { id: "date", defaultValue: null }),
      h(
        Form.Dropdown,
        { id: "drop", defaultValue: "second" },
        h(Form.Dropdown.Item, { value: "first", title: "First" }),
        h(Form.Dropdown.Item, { value: "second", title: "Second" }),
      ),
    );
  root.render(h("Views", null, makeForm("one"), makeForm("two")));
  for (const action of nodes().filter((node) => node.type === "Action.SubmitForm"))
    root.dispatch(action.id, "onAction", []);
  expect(values).toEqual([
    { text: "one", check: false, date: null, drop: "second" },
    { text: "two", check: false, date: null, drop: "second" },
  ]);
  root.unmount();
});
