import type { JsonValue, SceneNode } from "@blastlauncher/protocol";
import { event, text, type OutboundEvent } from "./nodes.ts";
import { filteringOf, groupsOf, rankGroups, score, searchable } from "./rank.ts";

const editable = new Set(
  [
    "TextField",
    "TextArea",
    "PasswordField",
    "Checkbox",
    "Dropdown",
    "TagPicker",
    "DatePicker",
    "FilePicker",
  ].map((name) => `Form.${name}`),
);
export function formFields(form: SceneNode): SceneNode[] {
  return form.children.filter((node) => editable.has(node.type));
}
export function nextField(fields: SceneNode[], id: string | undefined, delta: number) {
  if (!fields.length) return undefined;
  const index = fields.findIndex((node) => node.id === id);
  return fields[(Math.max(0, index) + delta + fields.length) % fields.length];
}
export function formOptions(field: SceneNode): SceneNode[] {
  function visit(node: SceneNode): SceneNode[] {
    return node.type === `${field.type}.Item` ? [node] : node.children.flatMap(visit);
  }
  return field.children.flatMap(visit);
}
/**
 * The items a `Form.Dropdown` shows for `query`, filtered and ranked per its
 * `filtering` (title, keywords, then value; sections ordered unless
 * `keepSectionOrder`). A dropdown that owns its search through
 * `onSearchTextChange` shows everything: forward the text with `searchDispatch`.
 */
export function formDropdownOptions(field: SceneNode, query = ""): SceneNode[] {
  return rankGroups(
    groupsOf(
      field,
      (node) => node.type === "Form.Dropdown.Item",
      (node) => node.type === "Form.Dropdown.Section",
    ),
    query,
    (node) => score({ ...searchable(node), subtitle: String(node.props.value ?? "") }, query),
    filteringOf(field),
  ).flatMap((group) => group.items);
}
/** Empty dates clear the field; reject normalized impossible dates such as February 30. */
export function parseDate(value: string): string | null | undefined {
  if (!value) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    )
  )
    return;
  const date = new Date(value);
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10))
    return;
  return date.toISOString();
}

export type FormInput =
  | { type: "focus"; id: string }
  | { type: "focusNext" | "focusPrev" }
  /** Dropdown values here edit its search query; optionChoose selects a value. */
  | { type: "setValue"; id: string; value: string }
  | { type: "toggle"; id: string }
  | { type: "optionMove"; delta: number }
  | { type: "optionChoose" }
  | { type: "submit" };

export type FormFieldView = {
  id: string;
  type: string;
  title: string;
  info: string;
  label: string;
  placeholder: string;
  error: string;
  value: JsonValue;
  text: string;
  checked: boolean;
  hasValue: boolean;
  selected: { value: string; title: string }[];
  options: { value: string; title: string }[];
  optionIndex: number;
  query: string;
  focused: boolean;
};

const valueOf = (field: SceneNode) =>
  Object.hasOwn(field.props, "value") ? field.props.value! : (field.props.defaultValue ?? null);
const emit = (
  events: OutboundEvent[],
  field: SceneNode | undefined,
  name: string,
  args: JsonValue[] = [],
) => {
  const out = event(field, name, args);
  if (out) events.push(out);
};
const optionView = (node: SceneNode) => ({
  value: text(node.props.value),
  title: text(node.props.title),
});

/** Form-only client state. Password contents never enter this state or its view. */
export function createFormController() {
  let form: SceneNode | undefined;
  let fields: SceneNode[] = [];
  let focusId: string | null = null;
  let reported: string | undefined;
  let pending: string[] = [];
  let optionIndex = 0;
  let enabled = true;
  const drafts = new Map<string, { text: string; value: JsonValue; error: string }>();
  const queries = new Map<string, string>();
  const optionsOf = (field: SceneNode) =>
    field.type === "Form.Dropdown"
      ? formDropdownOptions(field, queries.get(field.id) ?? "")
      : formOptions(field);
  function focus(id: string | undefined, events: OutboundEvent[], notify = true) {
    if ((id ?? null) === focusId) return;
    if (notify && enabled)
      emit(
        events,
        fields.find((field) => field.id === focusId),
        "onBlur",
      );
    focusId = id ?? null;
    optionIndex = 0;
    if (id && notify && enabled) {
      pending.push(id);
      emit(
        events,
        fields.find((field) => field.id === id),
        "onFocus",
      );
    }
  }
  function active(next: boolean, events: OutboundEvent[]) {
    if (next === enabled) return;
    enabled = next;
    const field = fields.find((candidate) => candidate.id === focusId);
    if (field && next) pending.push(field.id);
    emit(events, field, next ? "onFocus" : "onBlur");
  }
  return {
    active,
    scene(next: SceneNode | undefined, events: OutboundEvent[], interactive = true) {
      if (next?.id !== form?.id) {
        focusId = null;
        reported = undefined;
        pending = [];
        optionIndex = 0;
        drafts.clear();
        queries.clear();
      }
      const old = fields;
      form = next;
      fields = next ? formFields(next) : [];
      active(interactive, events);
      for (const [id, draft] of drafts) {
        const field = fields.find((candidate) => candidate.id === id);
        const previous = old.find((candidate) => candidate.id === id);
        if (
          !field ||
          (field.type === "Form.TextField" && field !== previous) ||
          (JSON.stringify(valueOf(field)) !== JSON.stringify(valueOf(previous ?? field)) &&
            JSON.stringify(valueOf(field)) !== JSON.stringify(draft.value))
        )
          drafts.delete(id);
      }
      const requested = fields.find((field) => field.props.focused)?.id;
      if (requested && requested !== reported) {
        const ack = pending.indexOf(requested);
        if (ack >= 0) pending.splice(0, ack + 1);
        else focus(requested, events, false);
      }
      reported = requested;
      if (!fields.some((field) => field.id === focusId)) focus(fields[0]?.id, events);
    },
    input(action: Exclude<FormInput, { type: "submit" }>, events: OutboundEvent[]) {
      const field = fields.find(
        (candidate) => candidate.id === ("id" in action ? action.id : focusId),
      );
      if (action.type === "focusNext" || action.type === "focusPrev")
        return focus(
          nextField(fields, focusId ?? undefined, action.type === "focusNext" ? 1 : -1)?.id,
          events,
        );
      if (!field) return;
      if (action.type === "focus") return focus(field.id, events);
      if (action.type === "toggle") {
        if (field.type === "Form.Checkbox") emit(events, field, "onChange", [!valueOf(field)]);
      } else if (action.type === "optionMove" || action.type === "optionChoose") {
        if (!["Form.Dropdown", "Form.TagPicker"].includes(field.type)) return;
        const options = optionsOf(field);
        const clamp = (index: number) => Math.max(0, Math.min(options.length - 1, index));
        optionIndex = clamp(optionIndex);
        if (action.type === "optionMove")
          optionIndex = clamp(optionIndex + Math.trunc(action.delta));
        else {
          const value = options[optionIndex]?.props.value;
          if (typeof value !== "string") return;
          const current = valueOf(field);
          const values = Array.isArray(current) ? current : [];
          emit(events, field, "onChange", [
            field.type === "Form.Dropdown"
              ? value
              : values.includes(value)
                ? values.filter((item) => item !== value)
                : [...values, value],
          ]);
        }
      } else if (action.type === "setValue") {
        if (field.type === "Form.Dropdown") {
          queries.set(field.id, action.value);
          optionIndex = 0;
          emit(events, field, "onSearchTextChange", [action.value]);
          return;
        }
        if (
          ![
            "Form.TextField",
            "Form.TextArea",
            "Form.PasswordField",
            "Form.DatePicker",
            "Form.FilePicker",
          ].includes(field.type)
        )
          return;
        let value: JsonValue = action.value;
        let error = "";
        if (field.type === "Form.DatePicker") {
          const parsed = parseDate(action.value);
          error = parsed === undefined ? "Enter a valid ISO date or date/time" : "";
          value = parsed ?? null;
        } else if (field.type === "Form.FilePicker") {
          const paths = action.value
            .split(",")
            .map((path) => path.trim())
            .filter(Boolean);
          value = field.props.allowMultipleSelection === false ? paths.slice(0, 1) : paths;
        }
        if (field.type !== "Form.PasswordField")
          drafts.set(field.id, { text: action.value, value, error });
        if (!error) emit(events, field, "onChange", [value]);
      }
    },
    view() {
      return {
        focusId,
        fields: fields.map((field): FormFieldView => {
          const password = field.type === "Form.PasswordField";
          const value = password ? null : valueOf(field);
          const draft = drafts.get(field.id);
          const options = optionsOf(field).map(optionView);
          return {
            id: field.id,
            type: field.type,
            title: text(field.props.title ?? field.props.id),
            info: text(field.props.info),
            label: text(field.props.label),
            placeholder: text(field.props.placeholder),
            error: draft?.error || text(field.props.error),
            value,
            text: password
              ? ""
              : (draft?.text ?? (Array.isArray(value) ? value.map(text).join(", ") : text(value))),
            checked: value === true,
            hasValue: password && field.props.hasValue === true,
            selected: formOptions(field)
              .map(optionView)
              .filter((option) =>
                Array.isArray(value) ? value.includes(option.value) : value === option.value,
              ),
            options,
            optionIndex:
              focusId === field.id && options.length
                ? Math.min(optionIndex, options.length - 1)
                : 0,
            query: queries.get(field.id) ?? "",
            focused: focusId === field.id,
          };
        }),
      };
    },
  };
}
