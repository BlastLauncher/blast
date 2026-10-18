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
// @covers Form.Description.Props
// @covers Form.Description.Props.title
// @covers Form.Description.Props.text
// @covers Form.Separator
// @covers Form.Separator.Props
// @covers Form.ItemProps
// @covers Form.ItemProps.id
// @covers Form.ItemProps.title
// @covers Form.ItemProps.info
// @covers Form.ItemProps.error
// @covers Form.ItemProps.storeValue partial
// @covers Form.ItemProps.autoFocus
// @covers Form.ItemProps.value
// @covers Form.ItemProps.defaultValue
// @covers Form.ItemProps.onChange
// @covers Form.ItemProps.onBlur
// @covers Form.ItemProps.onFocus
// @covers Form.Value
// @covers Form.Values
// @covers Form.Event
// @covers Form.Event.Type
// @covers Form.Event.target
// @covers Form.Event.target.id
// @covers Form.Event.target.value
// @covers Form.Event.type
// @covers Form.Props
// @covers Form.Props.enableDrafts partial
// @covers Form.TextField.Props
// @covers Form.TextArea.Props
// @covers Form.Checkbox.Props
// @covers Form.DatePicker.Props
// @covers Form.DatePicker.isFullDay
// @covers Form.Dropdown.Props
// @covers Form.Dropdown.Props.filtering.keepSectionOrder partial
// @covers Form.Dropdown.Item.Props
// @covers Form.Dropdown.Section.Props
// @covers Form.FilePicker.Props
// @covers Form.Description.Props
// @covers Form.TagPicker partial
// @covers Form.TagPicker.Props
// @covers Form.TagPicker.Props.id
// @covers Form.TagPicker.Props.title
// @covers Form.TagPicker.Props.info
// @covers Form.TagPicker.Props.error
// @covers Form.TagPicker.Props.storeValue partial
// @covers Form.TagPicker.Props.autoFocus
// @covers Form.TagPicker.Props.value
// @covers Form.TagPicker.Props.defaultValue
// @covers Form.TagPicker.Props.onChange
// @covers Form.TagPicker.Props.onBlur
// @covers Form.TagPicker.Props.onFocus
// @covers Form.TagPicker.Props.children
// @covers Form.TagPicker.Props.placeholder
// @covers Form.TagPicker.Item
// @covers Form.TagPicker.Item.Props
// @covers Form.TagPicker.Item.Props.value
// @covers Form.TagPicker.Item.Props.title
// @covers Form.TagPicker.Item.Props.icon
// @covers Form.PasswordField partial
// @covers Form.PasswordField.Props
// @covers Form.PasswordField.Props.id
// @covers Form.PasswordField.Props.title
// @covers Form.PasswordField.Props.info
// @covers Form.PasswordField.Props.error
// @covers Form.PasswordField.Props.storeValue partial
// @covers Form.PasswordField.Props.autoFocus
// @covers Form.PasswordField.Props.value partial
// @covers Form.PasswordField.Props.defaultValue partial
// @covers Form.PasswordField.Props.onChange
// @covers Form.PasswordField.Props.onBlur
// @covers Form.PasswordField.Props.onFocus
// @covers Form.PasswordField.Props.placeholder
// @covers Form.LinkAccessory
// @covers Form.LinkAccessory.Props
// @covers Form.LinkAccessory.Props.target
// @covers Form.LinkAccessory.Props.text
// @covers Action.SubmitForm partial
// @covers Action.SubmitForm.Props
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

// @covers Form.FilePicker partial
// @covers Form.FilePicker.Props.id
// @covers Form.FilePicker.Props.title
// @covers Form.FilePicker.Props.info
// @covers Form.FilePicker.Props.error
// @covers Form.FilePicker.Props.storeValue partial
// @covers Form.FilePicker.Props.autoFocus
// @covers Form.FilePicker.Props.value
// @covers Form.FilePicker.Props.defaultValue
// @covers Form.FilePicker.Props.onChange
// @covers Form.FilePicker.Props.onBlur
// @covers Form.FilePicker.Props.onFocus
// @covers Form.FilePicker.Props.allowMultipleSelection
// @covers Form.FilePicker.Props.canChooseDirectories
// @covers Form.FilePicker.Props.canChooseFiles
// @covers Form.FilePicker.Props.showHiddenFiles
test("FilePicker retains path arrays, controlled values, options and focus events through submit", () => {
  const { root, find, change, submit } = setup();
  let submitted: FormValues = {};
  const changes: string[][] = [];
  const events: FormEvent<string[]>[] = [];
  function Command() {
    const [files, setFiles] = useState(["/initial"]);
    return h(
      Form,
      {
        actions: h(Action.SubmitForm, {
          onSubmit: (values) => {
            submitted = values;
          },
        }),
      },
      h(Form.FilePicker, { id: "empty" }),
      h(Form.FilePicker, { id: "fixed", value: ["/fixed"] }),
      h(Form.FilePicker, {
        id: "local",
        defaultValue: ["/default"],
        onChange: (value) => changes.push(value),
      }),
      h(Form.FilePicker, {
        id: "controlled",
        value: files,
        defaultValue: ["/ignored"],
        onChange: setFiles,
        title: "Files",
        info: "Choose paths",
        error: "Required",
        autoFocus: true,
        storeValue: true,
        allowMultipleSelection: false,
        canChooseDirectories: true,
        canChooseFiles: false,
        showHiddenFiles: true,
        onFocus: (event) => events.push(event),
        onBlur: (event) => events.push(event),
      }),
    );
  }
  root.render(h(Command));
  expect(find("empty").props).toMatchObject({
    value: [],
    allowMultipleSelection: true,
    canChooseDirectories: false,
    canChooseFiles: true,
    showHiddenFiles: false,
  });
  expect(find("controlled").props).toMatchObject({
    value: ["/initial"],
    title: "Files",
    info: "Choose paths",
    error: "Required",
    autoFocus: true,
    storeValue: true,
    allowMultipleSelection: false,
    canChooseDirectories: true,
    canChooseFiles: false,
    showHiddenFiles: true,
  });
  change("local", ["/a", "/b"]);
  change("controlled", ["/directory"]);
  change("fixed", ["/ignored"]);
  root.render(h(Command));
  root.dispatch(find("controlled").id, "onFocus", []);
  root.dispatch(find("controlled").id, "onBlur", []);
  expect(events).toEqual(
    (["focus", "blur"] as const).map((type) => ({
      type,
      target: { id: "controlled", value: ["/directory"] },
    })),
  );
  expect(changes).toEqual([["/a", "/b"]]);
  submit();
  expect(submitted).toEqual({
    empty: [],
    fixed: ["/fixed"],
    local: ["/a", "/b"],
    controlled: ["/directory"],
  });
  change("local", []);
  submit();
  expect(submitted.local).toEqual([]);
  root.unmount();
});

// @covers Form.DatePicker.isFullDay
// @covers Form.Dropdown.Props.filtering.keepSectionOrder partial
test("DatePicker.isFullDay detects midnight values and Dropdown records keepSectionOrder", () => {
  expect(Form.DatePicker.isFullDay(new Date(2026, 9, 18))).toBe(true);
  expect(Form.DatePicker.isFullDay(new Date(2026, 9, 18, 12, 30))).toBe(false);
  expect(Form.DatePicker.isFullDay(new Date(2026, 9, 18, 0, 0, 0, 1))).toBe(false);
  expect(Form.DatePicker.isFullDay(null)).toBe(false);
  expect(Form.DatePicker.isFullDay()).toBe(false);
  const { root, find } = setup();
  root.render(
    h(
      Form,
      null,
      h(
        Form.Dropdown,
        { id: "drop", filtering: { keepSectionOrder: true } },
        h(Form.Dropdown.Item, { value: "one", title: "One" }),
      ),
    ),
  );
  expect(find("drop").props.filtering).toEqual({ keepSectionOrder: true });
  root.unmount();
});

// @covers Form.TagPicker partial
// @covers Form.LinkAccessory
// @covers Form.Props.enableDrafts partial
test("TagPicker retains value arrays, controlled values, options and focus events through submit", () => {
  const { root, find, change, submit, nodes } = setup();
  let submitted: FormValues = {};
  const changes: string[][] = [];
  const events: FormEvent<string[]>[] = [];
  function Command() {
    const [tags, setTags] = useState(["green"]);
    return h(
      Form,
      {
        enableDrafts: true,
        searchBarAccessory: h(Form.LinkAccessory, {
          target: "https://developers.raycast.com",
          text: "Docs",
        }),
        actions: h(Action.SubmitForm, {
          onSubmit: (values) => {
            submitted = values;
          },
        }),
      },
      h(Form.TagPicker, { id: "empty" }),
      h(Form.TagPicker, { id: "fixed", value: ["red"] }),
      h(
        Form.TagPicker,
        {
          id: "local",
          defaultValue: ["green"],
          onChange: (value) => changes.push(value),
        },
        h(Form.TagPicker.Item, { value: "red", title: "Red" }),
        h(Form.TagPicker.Item, { value: "green", title: "Green", icon: "🔵" }),
      ),
      h(
        Form.TagPicker,
        {
          id: "controlled",
          value: tags,
          defaultValue: ["/ignored"],
          onChange: setTags,
          title: "Tags",
          info: "Pick colors",
          error: "Required",
          autoFocus: true,
          storeValue: true,
          placeholder: "Add tag",
          onFocus: (event) => events.push(event),
          onBlur: (event) => events.push(event),
        },
        h(Form.TagPicker.Item, { value: "blue", title: "Blue" }),
      ),
    );
  }
  root.render(h(Command));
  expect(find("empty").props).toMatchObject({ value: [] });
  expect(find("controlled").props).toMatchObject({
    value: ["green"],
    title: "Tags",
    info: "Pick colors",
    error: "Required",
    autoFocus: true,
    storeValue: true,
    placeholder: "Add tag",
  });
  const items = nodes().filter((node) => node.type === "Form.TagPicker.Item");
  expect(items).toEqual([
    expect.objectContaining({ props: { value: "red", title: "Red" } }),
    expect.objectContaining({ props: { value: "green", title: "Green", icon: "🔵" } }),
    expect.objectContaining({ props: { value: "blue", title: "Blue" } }),
  ]);
  expect(nodes().find((node) => node.type === "Form.LinkAccessory")?.props).toEqual({
    target: "https://developers.raycast.com",
    text: "Docs",
  });
  expect(nodes().some((node) => node.type === "Form" && node.props.enableDrafts === true)).toBe(
    true,
  );
  change("local", ["green", "red"]);
  change("controlled", ["blue"]);
  change("fixed", ["ignored"]);
  root.render(h(Command));
  root.dispatch(find("controlled").id, "onFocus", []);
  root.dispatch(find("controlled").id, "onBlur", []);
  expect(events).toEqual(
    (["focus", "blur"] as const).map((type) => ({
      type,
      target: { id: "controlled", value: ["blue"] },
    })),
  );
  expect(changes).toEqual([["green", "red"]]);
  submit();
  expect(submitted).toEqual({
    empty: [],
    fixed: ["red"],
    local: ["green", "red"],
    controlled: ["blue"],
  });
  change("local", []);
  submit();
  expect(submitted.local).toEqual([]);
  root.unmount();
});

// @covers Form.PasswordField partial
test("PasswordField submits its value while every published scene stays secret-free", () => {
  // Every published snapshot is kept, so the earlier scenes can be checked too.
  const scenes: SceneSnapshot[] = [];
  const root = createSceneRoot({ publish: (next) => scenes.push(next) });
  const secret = "correct horse battery staple";
  function nodes(node: SceneNode = scenes.at(-1)!.root!): SceneNode[] {
    return [node, ...node.children.flatMap((child) => nodes(child))];
  }
  function find(id: string) {
    return nodes().find((item) => item.props.id === id)!;
  }
  let submitted: FormValues = {};
  function Command() {
    const [password, setPassword] = useState("");
    return h(
      Form,
      {
        actions: h(Action.SubmitForm, {
          onSubmit: (values) => {
            submitted = values;
          },
        }),
      },
      h(Form.PasswordField, { id: "empty", placeholder: "Empty" }),
      h(Form.PasswordField, { id: "defaulted", defaultValue: "default-secret" }),
      h(Form.PasswordField, {
        id: "controlled",
        value: password,
        onChange: setPassword,
        title: "Password",
        info: "Account password",
        error: "Required",
        autoFocus: true,
        storeValue: true,
        placeholder: "Type it",
        onFocus: (event) => {
          // Event payloads reaching the extension's own callbacks carry the
          // value; the published scene must not.
          expect(event.target.value).toBe(password);
        },
        onBlur: (event) => expect(event.target.value).toBe(password),
      }),
    );
  }
  root.render(h(Command));
  const assertSecretFree = () => {
    for (const scene of scenes) {
      expect(JSON.stringify(scene)).not.toContain(secret);
      expect(JSON.stringify(scene)).not.toContain("default-secret");
      const field = JSON.stringify(find("controlled").props);
      expect(field).not.toContain("value");
      expect(field).toContain('"hasValue"');
    }
  };
  expect(find("controlled").props).toMatchObject({
    title: "Password",
    info: "Account password",
    error: "Required",
    autoFocus: true,
    storeValue: true,
    placeholder: "Type it",
    hasValue: false,
  });
  expect(find("defaulted").props.hasValue).toBe(true);
  root.dispatch(find("controlled").id, "onChange", [secret]);
  root.flush();
  root.render(h(Command));
  expect(find("controlled").props.hasValue).toBe(true);
  root.dispatch(find("controlled").id, "onFocus", []);
  root.dispatch(find("controlled").id, "onBlur", []);
  assertSecretFree();
  const submitNode = nodes().find((node) => node.type === "Action.SubmitForm")!;
  expect(root.dispatch(submitNode.id, "onAction", [])).toBeUndefined();
  expect(submitted).toEqual({ empty: "", defaulted: "default-secret", controlled: secret });
  // Clearing the field drops the flag without a length hint.
  root.dispatch(find("controlled").id, "onChange", [""]);
  root.flush();
  expect(find("controlled").props.hasValue).toBe(false);
  assertSecretFree();
  root.unmount();
});
