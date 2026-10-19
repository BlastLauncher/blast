/** @jsxImportSource @opentui/react */
import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { type Preference, type StorageItems } from "@blastlauncher/host";

export function PreferencesForm({
  fields,
  initial,
  onSave,
  onCancel,
}: {
  fields: Preference[];
  initial: StorageItems;
  onSave: (values: StorageItems) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<StorageItems>(() =>
    Object.fromEntries(
      fields.map((p) => [
        p.name,
        initial[p.name] ??
          p.default ??
          (p.type === "checkbox" ? false : p.type === "dropdown" ? (p.data[0]?.value ?? "") : ""),
      ]),
    ),
  );
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const change = (name: string, value: string | boolean) =>
    setValues((v) => ({ ...v, [name]: value }));
  useKeyboard((key) => {
    if (saving) return;
    const field = fields[index];
    if (key.name === "escape") {
      key.preventDefault();
      onCancel();
    } else if (key.name === "return") {
      key.preventDefault();
      const missing = fields.filter(
        (p) => p.required && (values[p.name] === "" || values[p.name] === undefined),
      );
      if (missing.length) {
        setError(`Required: ${missing.map((p) => p.title).join(", ")}`);
        return;
      }
      setSaving(true);
      void onSave(values).catch((e) => {
        setError(String(e));
        setSaving(false);
      });
    } else if (key.name === "tab" || key.name === "up" || key.name === "down") {
      key.preventDefault();
      setIndex((i) =>
        Math.max(0, Math.min(fields.length - 1, i + (key.name === "up" || key.shift ? -1 : 1))),
      );
    } else if (field?.type === "checkbox" && key.name === "space") {
      key.preventDefault();
      change(field.name, !values[field.name]);
    } else if (field?.type === "dropdown" && (key.name === "left" || key.name === "right")) {
      key.preventDefault();
      const at = field.data.findIndex((o) => o.value === values[field.name]);
      const next =
        field.data[
          Math.max(0, Math.min(field.data.length - 1, at + (key.name === "right" ? 1 : -1)))
        ];
      if (next) change(field.name, next.value);
    } else if (field?.type === "password" && !key.ctrl && !key.meta && !key.option) {
      if (key.name === "backspace") {
        key.preventDefault();
        setValues((v) => ({ ...v, [field.name]: String(v[field.name] ?? "").slice(0, -1) }));
      } else if (
        key.sequence &&
        Array.from(key.sequence).every((c) => c.codePointAt(0)! >= 32 && c.codePointAt(0) !== 127)
      ) {
        key.preventDefault();
        const typed = key.sequence;
        setValues((v) => ({ ...v, [field.name]: String(v[field.name] ?? "") + typed }));
      }
    }
  });
  return (
    <box flexDirection="column" flexGrow={1}>
      <text height={1}>Preferences</text>
      {fields.map((p, i) => (
        <box key={p.name} flexDirection="column" flexShrink={0}>
          <text height={1}>
            {i === index ? "› " : "  "}
            {p.title}
            {p.required ? " *" : ""}
          </text>
          {p.type === "password" ? (
            <text height={1}>{values[p.name] ? "••••••••" : "(empty)"}</text>
          ) : p.type === "checkbox" ? (
            <text height={1}>{values[p.name] ? "[x]" : "[ ]"}</text>
          ) : p.type === "dropdown" ? (
            <text height={1}>
              ‹ {p.data.find((o) => o.value === values[p.name])?.title ?? ""} ›
            </text>
          ) : (
            <input
              focused={i === index}
              value={String(values[p.name] ?? "")}
              onInput={(v) => change(p.name, v)}
            />
          )}
        </box>
      ))}
      {error && <text height={1}>{error}</text>}
      <text height={1}>Tab/↑↓ Fields · ←→ Options · Space Toggle · Enter Save · Esc Cancel</text>
    </box>
  );
}
