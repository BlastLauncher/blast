import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { createController, type ControllerInput, type ControllerOptions } from "./controller.ts";
import type { ControllerView } from "./controller.ts";

// The launch prompt as views: a form for values the engine still needs and a
// status screen for work it does before a command renders. It builds a scene
// and runs it through the same controller a command's scenes go through, so
// the form behaves (focus, dropdowns, hidden passwords) exactly like an
// extension's. No I/O: answers come back as effects.

export type PromptValue = string | number | boolean;
export type PromptValues = Record<string, PromptValue>;
/** One input of the form. `key` identifies it in `values`, view field ids and effects. */
export type PromptField = {
  key: string;
  /** A preference or argument type: `textfield`, `password`, `checkbox`, `dropdown`, `file`, `directory`, `appPicker`. */
  type: string;
  title: string;
  description?: string;
  placeholder?: string;
  /** A checkbox's label next to the box. */
  label?: string;
  required: boolean;
  data?: { title: string; value: string }[];
};
export type PromptForm = {
  title: string;
  /** Primary action title, e.g. "Save & Launch". */
  submit: string;
  description?: string;
  sections: { title: string; fields: PromptField[] }[];
  /** Starting values by field key; missing ones start empty (checkbox off, dropdown on its first option). */
  values: PromptValues;
};
export type PromptStatus = {
  title: string;
  toast: {
    style: "animated" | "success" | "failure";
    title: string;
    message: string;
    /** Adds a Retry action to the toast and the primary action. */
    retry?: boolean;
  };
};
export type PromptEffect =
  | { type: "submit"; values: PromptValues }
  | { type: "retry" }
  | { type: "cancel" };
export type PromptResult = { effects: PromptEffect[] };
export type PromptController = {
  /** Replace the view with a form; the next `submit` effect carries its values. */
  form(form: PromptForm): void;
  /** Replace the view with a status screen: a toast over an empty detail. */
  status(status: PromptStatus): void;
  /** Any controller input; anything outside the prompt's own inputs is ignored. */
  input(input: ControllerInput): PromptResult;
  view(): ControllerView;
  subscribe(listener: (view: ControllerView) => void): () => void;
};

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });
const handler = (name: string) => ({ $handler: name });
const actions = (...children: SceneNode[]) =>
  node("Slot", "slot-actions", { name: "actions" }, [node("ActionPanel", "panel", {}, children)]);

const SET = "set:";
const empty = (value: PromptValue | undefined) => value === undefined || value === "";

/** The value a field starts with, so a form never shows a dropdown with nothing chosen. */
function initial(field: PromptField, values: PromptValues): PromptValue {
  const value = values[field.key];
  if (value !== undefined) return value;
  if (field.type === "checkbox") return false;
  if (field.type === "dropdown") return field.data?.[0]?.value ?? "";
  return "";
}

function fieldNode(field: PromptField, value: PromptValue, error: string): SceneNode {
  const common = {
    id: field.key,
    title: field.title,
    ...(field.description ? { info: field.description } : {}),
    ...(error ? { error } : {}),
    onChange: handler(`${SET}${field.key}`),
  };
  switch (field.type) {
    case "checkbox":
      return node("Form.Checkbox", field.key, {
        ...common,
        label: field.label ?? field.title,
        value: value === true,
      });
    case "dropdown":
      return node(
        "Form.Dropdown",
        field.key,
        { ...common, value: String(value) },
        (field.data ?? []).map((option) =>
          node("Form.Dropdown.Item", `${field.key}:${option.value}`, option),
        ),
      );
    case "password":
      return node("Form.PasswordField", field.key, {
        ...common,
        value: String(value),
        hasValue: value !== "",
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      });
    case "file":
    case "directory":
      return node("Form.FilePicker", field.key, {
        ...common,
        value: value === "" ? [] : [String(value)],
        allowMultipleSelection: false,
        canChooseFiles: field.type === "file",
        canChooseDirectories: field.type === "directory",
      });
    default:
      return node("Form.TextField", field.key, {
        ...common,
        value: String(value),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      });
  }
}

export function createPromptController(options: ControllerOptions): PromptController {
  const controller = createController(options);
  let revision = 0;
  let current: PromptForm | undefined;
  let values: PromptValues = {};
  let errors = new Map<string, string>();
  let status: PromptStatus | undefined;

  const show = (list: SceneNode, ...feedback: SceneNode[]) => {
    const message: SceneMessage = {
      type: "scene",
      revision: ++revision,
      root: node("Navigation", "prompt", { pop: handler("cancel") }, [
        node("Navigation.Entry", "entry", { active: true }, [list]),
        ...feedback,
      ]),
    };
    controller.scene(message);
  };
  const render = () => {
    if (current) {
      const form = current;
      const children: SceneNode[] = [];
      if (form.description)
        children.push(node("Form.Description", "description", { text: form.description }));
      form.sections.forEach((section, index) => {
        if (index > 0 || form.description) children.push(node("Form.Separator", `rule:${index}`));
        if (section.title)
          children.push(node("Form.Description", `section:${index}`, { text: section.title }));
        for (const field of section.fields)
          children.push(fieldNode(field, initial(field, values), errors.get(field.key) ?? ""));
      });
      children.push(
        actions(
          node("Action.SubmitForm", "submit", { title: form.submit, onSubmit: handler("submit") }),
        ),
      );
      show(node("Form", "prompt-form", { navigationTitle: form.title }, children));
    } else if (status) {
      const toast = status.toast;
      show(
        node(
          "Detail",
          "prompt-status",
          {
            navigationTitle: status.title,
            markdown: "",
            isLoading: toast.style === "animated",
          },
          toast.retry
            ? [actions(node("Action", "retry", { title: "Retry", onAction: handler("retry") }))]
            : [],
        ),
        node(
          "Toast",
          "toast",
          { style: toast.style.toUpperCase(), title: toast.title, message: toast.message },
          toast.retry
            ? [
                node("Toast.Action", "toast-retry", {
                  name: "primaryAction",
                  title: "Retry",
                  shortcut: { modifiers: [], key: "r" },
                  onAction: handler("retry"),
                }),
              ]
            : [],
        ),
      );
    }
  };

  const submit = (): PromptEffect[] => {
    if (!current) return [];
    errors = new Map();
    const all = current.sections.flatMap((section) => section.fields);
    for (const field of all)
      if (field.required && empty(initial(field, values))) errors.set(field.key, "Required");
    if (errors.size) return [];
    return [
      {
        type: "submit",
        values: Object.fromEntries(all.map((field) => [field.key, initial(field, values)])),
      },
    ];
  };

  return {
    form(form) {
      current = form;
      status = undefined;
      values = { ...form.values };
      errors = new Map();
      render();
    },
    status(next) {
      current = undefined;
      status = next;
      render();
    },
    input(input) {
      const effects: PromptEffect[] = [];
      const result = controller.input(input);
      // The controller asks to close on `back`; the prompt cancels instead.
      if (result.effects.some((effect) => effect.type === "quit")) effects.push({ type: "cancel" });
      let changed = false;
      for (const { handler: name, args } of result.events) {
        if (name === "cancel") effects.push({ type: "cancel" });
        else if (name === "retry") effects.push({ type: "retry" });
        else if (name === "submit") {
          effects.push(...submit());
          changed = true;
        } else if (name.startsWith(SET)) {
          const key = name.slice(SET.length);
          const field = current?.sections.flatMap((s) => s.fields).find((f) => f.key === key);
          const value = args[0];
          if (!field) continue;
          if (Array.isArray(value)) values[key] = typeof value[0] === "string" ? value[0] : "";
          else if (
            typeof value === "string" ||
            typeof value === "boolean" ||
            typeof value === "number"
          )
            values[key] = value;
          errors.delete(key);
          changed = true;
        }
      }
      if (changed) render();
      return { effects };
    },
    view: () => controller.view(),
    subscribe: (listener) => controller.subscribe(listener),
  };
}
