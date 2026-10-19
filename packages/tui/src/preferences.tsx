/** @jsxImportSource @opentui/react */
import { useState } from "react";
import { useKeyboard, usePaste } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { type Preference, type StorageItems } from "@blastlauncher/host";
import { theme } from "./theme.ts";
import { pastedText } from "./paste.ts";

function usePreferenceFormState({
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

  const change = (name: string, value: string | boolean | number) => {
    setValues((v) => ({ ...v, [name]: value }));
    setError("");
  };

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

  usePaste((paste) => {
    const field = fields[index];
    if (saving || field?.type !== "password") return;
    // Terminals deliver pastes as one bracketed event, not key presses.
    paste.preventDefault();
    const text = pastedText(paste);
    setValues((v) => ({ ...v, [field.name]: String(v[field.name] ?? "") + text }));
  });

  return { values, index, error, saving, change };
}

function PreferenceFieldItem({
  field,
  focused,
  value,
  onChange,
  showDescription = false,
}: {
  field: Preference;
  focused: boolean;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
  showDescription?: boolean;
}) {
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      {...(focused ? { backgroundColor: theme.colors.selectionBg } : {})}
    >
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text
          width={22}
          height={1}
          flexShrink={0}
          textAlign="right"
          fg={theme.colors.textMuted}
          wrapMode="none"
        >
          {focused ? "› " : "  "}
          {field.title}
          {field.required ? " *" : ""}
          {"  "}
        </text>
        <box flexGrow={1} flexShrink={1}>
          {field.type === "password" ? (
            <text height={1} fg={focused ? theme.colors.selectionFg : theme.colors.text}>
              {value ? "••••••••" : "(empty)"}
            </text>
          ) : field.type === "checkbox" ? (
            <text height={1} fg={focused ? theme.colors.selectionFg : theme.colors.text}>
              {value ? "[x]" : "[ ]"}
            </text>
          ) : field.type === "dropdown" ? (
            <text height={1} fg={focused ? theme.colors.selectionFg : theme.colors.text}>
              ‹ {field.data.find((o) => o.value === value)?.title ?? ""} ›
            </text>
          ) : (
            <input
              focused={focused}
              value={String(value ?? "")}
              textColor={focused ? theme.colors.selectionFg : theme.colors.text}
              placeholderColor={theme.colors.textMuted}
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              onInput={(v) => onChange(v)}
            />
          )}
        </box>
      </box>
      {showDescription && focused && field.description ? (
        <box flexDirection="row" width="100%" height={1} flexShrink={0}>
          <text width={22} height={1} flexShrink={0} />
          <text height={1} fg={theme.colors.textMuted} wrapMode="none">
            {field.description}
          </text>
        </box>
      ) : null}
    </box>
  );
}

export function LaunchGate({
  commandTitle,
  fields,
  initial,
  onSave,
  onCancel,
}: {
  commandTitle: string;
  fields: Preference[];
  initial: StorageItems;
  onSave: (values: StorageItems) => Promise<void>;
  onCancel: () => void;
}) {
  const { values, index, error, change } = usePreferenceFormState({
    fields,
    initial,
    onSave,
    onCancel,
  });

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      borderStyle="rounded"
      borderColor={theme.colors.border}
      title={`Set up ${commandTitle}`}
      backgroundColor={theme.colors.background}
    >
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
        <text height={1} fg={theme.colors.textMuted}>
          These values are required before the command can run.
        </text>
        <box
          height={1}
          flexShrink={0}
          border={["top"]}
          borderStyle="single"
          borderColor={theme.colors.border}
        />
        {fields.map((p, i) => (
          <PreferenceFieldItem
            key={p.name}
            field={p}
            focused={i === index}
            value={values[p.name]}
            onChange={(v) => change(p.name, v)}
          />
        ))}
        {error && (
          <text height={1} fg={theme.colors.danger}>
            {error}
          </text>
        )}
      </box>
      <box
        height={1}
        flexShrink={0}
        backgroundColor={theme.colors.panel}
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={theme.colors.textMuted}>Save & Launch ↵</text>
        <text fg={theme.colors.textMuted}>Cancel Esc</text>
      </box>
    </box>
  );
}

export function PreferencesView({
  extensionTitle,
  commandTitle,
  extensionFields,
  commandFields,
  scope,
  initial,
  onSave,
  onCancel,
}: {
  extensionTitle: string;
  commandTitle: string;
  extensionFields: Preference[];
  commandFields: Preference[];
  scope?: "extension" | "command" | undefined;
  initial: StorageItems;
  onSave: (values: StorageItems) => Promise<void>;
  onCancel: () => void;
}) {
  const showExtension = extensionFields.length > 0;
  const showCommand = scope !== "extension" && commandFields.length > 0;

  const sections: { title: string; fields: Preference[] }[] = [];
  if (showExtension) sections.push({ title: "Extension", fields: extensionFields });
  if (showCommand) sections.push({ title: commandTitle, fields: commandFields });

  const allFields = sections.flatMap((s) => s.fields);

  const { values, index, error, change } = usePreferenceFormState({
    fields: allFields,
    initial,
    onSave,
    onCancel,
  });

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      borderStyle="rounded"
      borderColor={theme.colors.border}
      title={`Preferences — ${extensionTitle}`}
      backgroundColor={theme.colors.background}
    >
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
        {sections.map((section) => (
          <box key={section.title} flexDirection="column" flexShrink={0}>
            <text height={1} fg={theme.colors.textMuted} attributes={TextAttributes.BOLD}>
              {section.title}
            </text>
            <box
              height={1}
              flexShrink={0}
              border={["top"]}
              borderStyle="single"
              borderColor={theme.colors.border}
            />
            {section.fields.map((p) => {
              const i = allFields.indexOf(p);
              return (
                <PreferenceFieldItem
                  key={p.name}
                  field={p}
                  focused={i === index}
                  value={values[p.name]}
                  onChange={(v) => change(p.name, v)}
                  showDescription={true}
                />
              );
            })}
          </box>
        ))}
        {error && (
          <text height={1} fg={theme.colors.danger}>
            {error}
          </text>
        )}
      </box>
      <box
        height={1}
        flexShrink={0}
        backgroundColor={theme.colors.panel}
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={theme.colors.textMuted}>Save ↵</text>
        <text fg={theme.colors.textMuted}>Cancel Esc</text>
      </box>
    </box>
  );
}
