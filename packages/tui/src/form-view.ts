import type { SceneNode } from "@blastlauncher/protocol";

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
