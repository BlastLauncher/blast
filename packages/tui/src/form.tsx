/** @jsxImportSource @opentui/react */
import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import type { JsonValue, SceneNode } from "@blastlauncher/protocol";
import { event, text } from "./view.ts";
import { formFields, formOptions, nextField, parseDate } from "./form-view.ts";

type Send = (value: ReturnType<typeof event>) => void;
export function FormView({
  form,
  enabled,
  send,
  submit,
}: {
  form: SceneNode;
  enabled: boolean;
  send: Send;
  submit: () => void;
}) {
  const fields = formFields(form);
  const [focus, setFocus] = useState<string | undefined>(
    () => (fields.find((node) => node.props.focused) ?? fields[0])?.id,
  );
  const field = fields.find((node) => node.id === focus) ?? fields[0];
  const reported = fields.find((node) => node.props.focused)?.id;
  const previous = useRef(reported);
  const pendingFocus = useRef<string[]>([]);
  const scroll = useRef<ScrollBoxRenderable>(null);
  const [option, setOption] = useState(0);
  useEffect(() => {
    if (reported !== previous.current && reported) {
      const acknowledged = pendingFocus.current.indexOf(reported);
      if (acknowledged >= 0) pendingFocus.current.splice(0, acknowledged + 1);
      else setFocus(reported);
    }
    previous.current = reported;
  }, [reported]);
  useEffect(() => {
    scroll.current?.scrollChildIntoView(field?.id ?? "");
    if (enabled && field) {
      if (pendingFocus.current.at(-1) !== field.id) pendingFocus.current.push(field.id);
      send(event(field, "onFocus"));
    }
    return () => {
      if (enabled && field) send(event(field, "onBlur"));
    };
  }, [field?.id, enabled]);
  function move(delta: number) {
    const next = nextField(fields, field?.id, delta)?.id;
    if (next) pendingFocus.current.push(next);
    setFocus(next);
    setOption(0);
  }
  const secret = useRef({ id: "", value: "" });
  useKeyboard((key) => {
    if (!enabled || key.defaultPrevented) return;
    if (key.name === "tab") {
      key.preventDefault();
      move(key.shift ? -1 : 1);
    } else if (key.ctrl && (key.name === "s" || key.name === "return")) {
      key.preventDefault();
      submit();
    } else if (
      field &&
      (key.name === "up" || key.name === "down") &&
      field.type !== "Form.TextArea"
    ) {
      key.preventDefault();
      move(key.name === "down" ? 1 : -1);
    } else if (field && ["Form.Dropdown", "Form.TagPicker"].includes(field.type)) {
      const options = formOptions(field);
      if (key.name === "left" || key.name === "right") {
        key.preventDefault();
        setOption(
          Math.max(0, Math.min(options.length - 1, option + (key.name === "right" ? 1 : -1))),
        );
      } else if (key.name === "return" || key.name === "space") {
        key.preventDefault();
        const value = options[option]?.props.value;
        if (typeof value !== "string") return;
        const values = Array.isArray(field.props.value) ? field.props.value : [];
        send(
          event(field, "onChange", [
            field.type === "Form.Dropdown"
              ? value
              : values.includes(value)
                ? values.filter((item) => item !== value)
                : [...values, value],
          ]),
        );
      }
    } else if (key.name === "space" && field?.type === "Form.Checkbox") {
      key.preventDefault();
      send(event(field, "onChange", [!field.props.value]));
    } else if (key.name === "return" && field?.type !== "Form.TextArea") {
      key.preventDefault();
      submit();
    } else if (field?.type === "Form.PasswordField") {
      // No terminal input widget ever receives the secret, even for one frame.
      if (secret.current.id !== field.id) secret.current = { id: field.id, value: "" };
      if (key.ctrl || key.meta || key.option || key.name === "escape") return;
      if (key.name === "backspace") secret.current.value = secret.current.value.slice(0, -1);
      else if (
        key.sequence &&
        Array.from(key.sequence).every(
          (char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127,
        )
      )
        secret.current.value += key.sequence;
      else return;
      key.preventDefault();
      send(event(field, "onChange", [secret.current.value]));
    }
  });
  return (
    <scrollbox ref={scroll} flexGrow={1}>
      {form.children
        .filter((node) => node.type !== "Slot")
        .map((node) => {
          const selected = node.id === field?.id;
          const options = formOptions(node);
          const kind = node.type.slice(5);
          return (
            <box key={node.id} id={node.id} flexDirection="column" flexShrink={0}>
              <text height={1}>
                {selected ? "› " : "  "}
                {text(node.props.title ?? node.props.id)}
                {node.props.info ? ` · ${text(node.props.info)}` : ""}
              </text>
              {["TextField", "TextArea", "DatePicker", "FilePicker"].includes(kind) ? (
                <FieldInput node={node} enabled={enabled && selected} send={send} />
              ) : (
                <text height={Math.max(1, options.length)}>
                  {kind === "PasswordField"
                    ? node.props.hasValue
                      ? "••••••••"
                      : text(node.props.placeholder)
                    : kind === "Checkbox"
                      ? `[${node.props.value ? "x" : " "}] ${text(node.props.label)}`
                      : options.length
                        ? options
                            .map((item, index) => {
                              const checked = Array.isArray(node.props.value)
                                ? node.props.value.includes(item.props.value ?? null)
                                : node.props.value === item.props.value;
                              return `${selected && index === option ? "›" : " "} [${checked ? "x" : " "}] ${text(item.props.title)}`;
                            })
                            .join("\n")
                        : kind === "Separator"
                          ? "────────"
                          : kind === "Description" || kind === "LinkAccessory"
                            ? text(node.props.text)
                            : kind === "Dropdown" || kind === "TagPicker"
                              ? text(node.props.placeholder)
                              : `[Unsupported: ${node.type}]`}
                </text>
              )}
              {!!node.props.error && <text height={1}>{text(node.props.error)}</text>}
            </box>
          );
        })}
      {form.children
        .filter((node) => node.type === "Slot" && node.props.name !== "actions")
        .flatMap((node) => node.children)
        .map((node) => (
          <text key={node.id}>
            {node.type === "Form.LinkAccessory"
              ? `${text(node.props.text)} ${text(node.props.target)}`
              : `[Unsupported: ${node.type}]`}
          </text>
        ))}
    </scrollbox>
  );
}

function FieldInput({ node, enabled, send }: { node: SceneNode; enabled: boolean; send: Send }) {
  const area = useRef<TextareaRenderable>(null);
  const value = Array.isArray(node.props.value)
    ? node.props.value.map(text).join(", ")
    : text(node.props.value);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const syncing = useRef(false);
  const sent = useRef<string | undefined>(undefined);
  const applied = useRef(value);
  useEffect(() => {
    if (node.type !== "Form.TextField" && applied.current === value) return;
    applied.current = value;
    // Keep typed date/path syntax when the runtime acknowledges its normalized value.
    if (sent.current === value && ["Form.DatePicker", "Form.FilePicker"].includes(node.type))
      return;
    setDraft(value);
    setError("");
  }, [node]);
  useEffect(() => {
    if (area.current && area.current.plainText !== value) {
      syncing.current = true;
      area.current.setText(value);
      syncing.current = false;
    }
  }, [value]);
  function change(input: string) {
    if (syncing.current) return;
    setDraft(input);
    let next: JsonValue = input;
    if (node.type === "Form.DatePicker") {
      const date = parseDate(input);
      setError(date === undefined ? "Enter a valid ISO date or date/time" : "");
      if (date === undefined) return;
      next = date;
    } else if (node.type === "Form.FilePicker") {
      const paths = input
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean);
      next = node.props.allowMultipleSelection === false ? paths.slice(0, 1) : paths;
    }
    sent.current = Array.isArray(next) ? next.map(text).join(", ") : text(next);
    send(event(node, "onChange", [next]));
  }
  return (
    <box flexDirection="column" flexShrink={0}>
      {node.type === "Form.TextArea" ? (
        <textarea
          ref={area}
          focused={enabled}
          height={4}
          initialValue={value}
          placeholder={text(node.props.placeholder)}
          onContentChange={() => change(area.current?.plainText ?? "")}
        />
      ) : (
        <input
          focused={enabled}
          value={draft}
          placeholder={text(node.props.placeholder)}
          onInput={change}
        />
      )}
      {!!error && <text height={1}>{error}</text>}
    </box>
  );
}
