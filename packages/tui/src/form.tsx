/** @jsxImportSource @opentui/react */
import { useEffect, useRef } from "react";
import { useKeyboard, usePaste } from "@opentui/react";
import type { ScrollBoxRenderable, TextareaRenderable } from "@opentui/core";
import type { SceneNode } from "@blastlauncher/protocol";
import {
  text,
  type ControllerInput,
  type ControllerView,
  type FormFieldView,
} from "@blastlauncher/client-core";
import { pastedText } from "./paste.ts";

export function FormView({
  form,
  view,
  enabled,
  input,
}: {
  form: SceneNode;
  view: NonNullable<ControllerView["form"]>;
  enabled: boolean;
  input: (action: ControllerInput) => void;
}) {
  const field = view.fields.find((candidate) => candidate.focused);
  const scroll = useRef<ScrollBoxRenderable>(null);
  useEffect(() => {
    scroll.current?.scrollChildIntoView(view.focusId ?? "");
  }, [view.focusId]);
  const secret = useRef({ id: "", value: "" });
  useKeyboard((key) => {
    if (!enabled || key.defaultPrevented) return;
    if (key.name === "tab") {
      key.preventDefault();
      input({ type: key.shift ? "focusPrev" : "focusNext" });
    } else if (key.ctrl && (key.name === "s" || key.name === "return")) {
      key.preventDefault();
      input({ type: "submit" });
    } else if (
      field &&
      (key.name === "up" || key.name === "down") &&
      field.type !== "Form.TextArea"
    ) {
      key.preventDefault();
      input({ type: key.name === "down" ? "focusNext" : "focusPrev" });
    } else if (field && ["Form.Dropdown", "Form.TagPicker"].includes(field.type)) {
      if (key.name === "left" || key.name === "right") {
        key.preventDefault();
        input({ type: "optionMove", delta: key.name === "right" ? 1 : -1 });
      } else if (key.name === "return" || key.name === "space") {
        key.preventDefault();
        input({ type: "optionChoose" });
      }
    } else if (key.name === "space" && field?.type === "Form.Checkbox") {
      key.preventDefault();
      input({ type: "toggle", id: field.id });
    } else if (key.name === "return" && field?.type !== "Form.TextArea") {
      key.preventDefault();
      input({ type: "submit" });
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
      input({ type: "setValue", id: field.id, value: secret.current.value });
    }
  });
  usePaste((paste) => {
    if (!enabled || field?.type !== "Form.PasswordField") return;
    // Terminals deliver pastes as one bracketed event, not key presses.
    if (secret.current.id !== field.id) secret.current = { id: field.id, value: "" };
    paste.preventDefault();
    secret.current.value += pastedText(paste);
    input({ type: "setValue", id: field.id, value: secret.current.value });
  });
  return (
    <scrollbox ref={scroll} flexGrow={1}>
      {form.children
        .filter((node) => node.type !== "Slot")
        .map((node) => {
          const display = view.fields.find((candidate) => candidate.id === node.id);
          const selected = display?.focused === true;
          const options = display?.options ?? [];
          const kind = node.type.slice(5);
          return (
            <box key={node.id} id={node.id} flexDirection="column" flexShrink={0}>
              <text height={1}>
                {selected ? "› " : "  "}
                {display?.title ?? text(node.props.title ?? node.props.id)}
                {(display?.info ?? text(node.props.info))
                  ? ` · ${display?.info ?? text(node.props.info)}`
                  : ""}
              </text>
              {["TextField", "TextArea", "DatePicker", "FilePicker"].includes(kind) ? (
                <FieldInput field={display!} enabled={enabled && selected} input={input} />
              ) : (
                <text height={Math.max(1, options.length)}>
                  {kind === "PasswordField"
                    ? display?.hasValue
                      ? "••••••••"
                      : text(node.props.placeholder)
                    : kind === "Checkbox"
                      ? `[${display?.checked ? "x" : " "}] ${display?.label}`
                      : options.length
                        ? options
                            .map((item, index) => {
                              const checked = display?.selected.some(
                                (choice) => choice.value === item.value,
                              );
                              return `${selected && index === display?.optionIndex ? "›" : " "} [${checked ? "x" : " "}] ${item.title}`;
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
              {!!display?.error && <text height={1}>{display.error}</text>}
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

function FieldInput({
  field,
  enabled,
  input,
}: {
  field: FormFieldView;
  enabled: boolean;
  input: (action: ControllerInput) => void;
}) {
  const area = useRef<TextareaRenderable>(null);
  const syncing = useRef(false);
  useEffect(() => {
    if (area.current && area.current.plainText !== field.text) {
      syncing.current = true;
      area.current.setText(field.text);
      syncing.current = false;
    }
  }, [field.text]);
  const change = (value: string) => {
    if (!syncing.current) input({ type: "setValue", id: field.id, value });
  };
  return field.type === "Form.TextArea" ? (
    <textarea
      ref={area}
      focused={enabled}
      height={4}
      initialValue={field.text}
      placeholder={field.placeholder}
      onContentChange={() => change(area.current?.plainText ?? "")}
    />
  ) : (
    <input focused={enabled} value={field.text} placeholder={field.placeholder} onInput={change} />
  );
}
