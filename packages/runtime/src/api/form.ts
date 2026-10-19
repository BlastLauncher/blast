import {
  Children,
  createContext,
  createElement,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { requestCapability } from "./capability.ts";
import { DatePickerType } from "./enums.generated.ts";
import { environment } from "./environment.ts";
import { slot } from "./slot.ts";
import type { ImageLike, Shortcut } from "./types.ts";

export type FormValue = string | number | boolean | string[] | number[] | Date | null;
export type FormValues = Record<string, FormValue>;
export interface FormEvent<T extends FormValue> {
  target: { id: string; value?: T };
  type: "focus" | "blur";
}
/** `Form.ItemReference`: the shared imperative handle every field ref exposes. */
export interface FormItemRef {
  focus: () => void;
  reset: () => void;
}
export interface FormItemProps<T extends FormValue> {
  id: string;
  title?: string;
  info?: string;
  error?: string;
  storeValue?: boolean;
  autoFocus?: boolean;
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  onBlur?: (event: FormEvent<T>) => void;
  onFocus?: (event: FormEvent<T>) => void;
}
export interface FormProps {
  children?: ReactNode;
  actions?: ReactNode;
  searchBarAccessory?: ReactNode;
  navigationTitle?: string;
  isLoading?: boolean;
  enableDrafts?: boolean;
}
export interface FormTextFieldProps extends FormItemProps<string> {
  placeholder?: string;
}
export interface FormTextAreaProps extends FormTextFieldProps {
  enableMarkdown?: boolean;
}
export interface FormCheckboxProps extends FormItemProps<boolean> {
  label: string;
}
/** `Form.DatePicker.Type`: what a date picker lets the user pick. */
export { DatePickerType };
export interface FormFilePickerProps extends FormItemProps<string[]> {
  allowMultipleSelection?: boolean;
  canChooseDirectories?: boolean;
  canChooseFiles?: boolean;
  showHiddenFiles?: boolean;
}
export interface FormPasswordFieldProps extends FormItemProps<string> {
  placeholder?: string;
}
export interface FormTagPickerProps extends FormItemProps<string[]> {
  children?: ReactNode;
  placeholder?: string;
}
export interface FormTagPickerItemProps {
  value: string;
  title: string;
  icon?: ImageLike;
}
export interface FormLinkAccessoryProps {
  target: string;
  text: string;
}
export interface FormDatePickerProps extends FormItemProps<Date | null> {
  type?: (typeof DatePickerType)[keyof typeof DatePickerType];
  min?: Date;
  max?: Date;
}
export interface FormDropdownProps extends FormItemProps<string> {
  children?: ReactNode;
  placeholder?: string;
  filtering?: boolean | { keepSectionOrder: boolean };
  isLoading?: boolean;
  throttle?: boolean;
  onSearchTextChange?: (text: string) => void;
}
export interface FormDropdownItemProps {
  value: string;
  title: string;
  icon?: ImageLike;
  keywords?: string[];
}
export interface FormDropdownSectionProps {
  children?: ReactNode;
  title?: string;
}
export interface FormDescriptionProps {
  title?: string;
  text: string;
}

type Fields = Map<string, { read: () => FormValue; secret: boolean }>;
interface FormContextValue {
  fields: Fields;
  enableDrafts: boolean;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
}
const FormContext = createContext<FormContextValue | null>(null);

// A Date does not round-trip through JSON; everything else in `FormValue`
// does, so only Dates need a tagged encoding.
function encodeValue(value: FormValue): unknown {
  return value instanceof Date ? { $date: value.toISOString() } : value;
}
function decodeValue(value: unknown): FormValue {
  if (value && typeof value === "object" && !Array.isArray(value) && "$date" in value) {
    return new Date((value as { $date: string }).$date);
  }
  return value as FormValue;
}
/** Decodes a stored or wire-carried values object back into typed `FormValue`s. */
export function decodeFormValues(values: Record<string, unknown>): FormValues {
  const result: FormValues = {};
  for (const [id, value] of Object.entries(values)) result[id] = decodeValue(value);
  return result;
}

function fieldKey(id: string): string {
  return `blast:field:${JSON.stringify([environment.commandName, id])}`;
}
function draftKey(): string {
  return `blast:draft:${environment.commandName}`;
}
async function saveDraft(fields: Fields): Promise<void> {
  const values: Record<string, unknown> = {};
  for (const [id, entry] of fields) {
    if (!entry.secret) values[id] = encodeValue(entry.read());
  }
  await requestCapability("storage.set", {
    scope: "blast:internal",
    key: draftKey(),
    value: JSON.stringify(values),
  });
}
async function clearDraft(): Promise<void> {
  await requestCapability("storage.remove", { scope: "blast:internal", key: draftKey() });
}

function Field<T extends string | string[] | boolean | Date | null>({
  kind,
  initial,
  secret,
  fieldRef,
  ...props
}: FormItemProps<T> & {
  kind: string;
  initial: T;
  children?: ReactNode;
  secret?: boolean;
  fieldRef?: Ref<FormItemRef>;
}) {
  const ctx = useContext(FormContext);
  const [local, setLocal] = useState(props.defaultValue ?? initial);
  const value = props.value !== undefined ? props.value : local;
  const current = useRef(value);
  current.current = value;
  const edited = useRef(false);
  const key = fieldKey(props.id);

  // Restoring a stored value behaves like an uncontrolled `defaultValue`
  // update that arrives after mount; a concurrent edit always wins.
  useEffect(() => {
    if (secret || !props.storeValue || props.value !== undefined) return;
    let mounted = true;
    void requestCapability("storage.get", { scope: "blast:internal", key })
      .then((stored) => {
        if (!mounted || edited.current || typeof stored !== "string") return;
        const restored = decodeValue(JSON.parse(stored)) as T;
        current.current = restored;
        setLocal(restored);
        props.onChange?.(restored);
      })
      .catch((error: unknown) => console.error("Form field restore failed", error));
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, secret, props.storeValue, props.value]);

  useLayoutEffect(() => {
    if (!ctx) return;
    const read = () => current.current;
    ctx.fields.set(props.id, { read, secret: !!secret });
    return () => {
      if (ctx.fields.get(props.id)?.read === read) ctx.fields.delete(props.id);
    };
  }, [ctx, props.id, secret]);

  // The scene only ever marks one field focused at a time; each field fires
  // its own onFocus/onBlur exactly once as `focusedId` transitions past it.
  const wasFocused = useRef(false);
  useEffect(() => {
    const isFocused = ctx?.focusedId === props.id;
    if (isFocused === wasFocused.current) return;
    wasFocused.current = isFocused;
    const callback = isFocused ? props.onFocus : props.onBlur;
    callback?.({ target: { id: props.id, value: current.current }, type: isFocused ? "focus" : "blur" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.focusedId, props.id]);

  useImperativeHandle(
    fieldRef,
    (): FormItemRef => ({
      focus: () => ctx?.setFocusedId(props.id),
      reset: () => {
        const next = (props.defaultValue ?? initial) as T;
        edited.current = true;
        current.current = next;
        if (props.value === undefined) setLocal(next);
        props.onChange?.(next);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, props.id, props.defaultValue, initial, props.value],
  );

  const scene: Record<string, unknown> = { ...props };
  // Secret fields (PasswordField) keep their value runtime-side only: the scene
  // carries a boolean `hasValue` instead of `value`/`defaultValue`, so published
  // scenes and client logs never contain the secret.
  if (secret) {
    delete scene.value;
    delete scene.defaultValue;
    scene.hasValue = value !== undefined && value !== null && value !== "";
  } else {
    scene.value = value;
  }
  scene.focused = ctx?.focusedId === props.id;
  return createElement(`Form.${kind}`, {
    ...scene,
    onChange: (input: T | string) => {
      // Dates arrive from clients as ISO strings; extension callbacks see Dates.
      const next = (
        kind === "DatePicker" && typeof input === "string" ? new Date(input) : input
      ) as T;
      edited.current = true;
      current.current = next;
      if (props.value === undefined) setLocal(next);
      props.onChange?.(next);
      if (!secret) {
        if (props.storeValue) {
          void requestCapability("storage.set", {
            scope: "blast:internal",
            key,
            value: JSON.stringify(encodeValue(next)),
          }).catch((error: unknown) => console.error("Form field save failed", error));
        }
        if (ctx?.enableDrafts) {
          void saveDraft(ctx.fields).catch((error: unknown) =>
            console.error("Form draft save failed", error),
          );
        }
      }
    },
    onFocus: props.onFocus
      ? () => props.onFocus?.({ target: { id: props.id, value: current.current }, type: "focus" })
      : undefined,
    onBlur: props.onBlur
      ? () => props.onBlur?.({ target: { id: props.id, value: current.current }, type: "blur" })
      : undefined,
  });
}

function TextField(props: FormTextFieldProps, ref: Ref<FormItemRef>) {
  return createElement(Field<string>, { ...props, kind: "TextField", initial: "", fieldRef: ref });
}
function PasswordField(props: FormPasswordFieldProps, ref: Ref<FormItemRef>) {
  return createElement(Field<string>, {
    ...props,
    kind: "PasswordField",
    initial: "",
    secret: true,
    fieldRef: ref,
  });
}
function TextArea(props: FormTextAreaProps, ref: Ref<FormItemRef>) {
  return createElement(Field<string>, { ...props, kind: "TextArea", initial: "", fieldRef: ref });
}
function Checkbox(props: FormCheckboxProps, ref: Ref<FormItemRef>) {
  return createElement(Field<boolean>, { ...props, kind: "Checkbox", initial: false, fieldRef: ref });
}
const DatePicker = Object.assign(
  forwardRef(function DatePicker(props: FormDatePickerProps, ref: Ref<FormItemRef>) {
    return createElement(Field<Date | null>, {
      ...props,
      kind: "DatePicker",
      initial: null,
      fieldRef: ref,
    });
  }),
  {
    Type: DatePickerType,
    /** Whether the date is a full day: non-null with local time exactly midnight. */
    isFullDay(date?: Date | null): boolean {
      return (
        !!date &&
        date.getHours() === 0 &&
        date.getMinutes() === 0 &&
        date.getSeconds() === 0 &&
        date.getMilliseconds() === 0
      );
    },
  },
);
function FilePicker(props: FormFilePickerProps, ref: Ref<FormItemRef>) {
  return createElement(Field<string[]>, {
    allowMultipleSelection: true,
    canChooseDirectories: false,
    canChooseFiles: true,
    showHiddenFiles: false,
    ...props,
    kind: "FilePicker",
    initial: [],
    fieldRef: ref,
  });
}
const TagPicker = Object.assign(
  forwardRef(function TagPicker(props: FormTagPickerProps, ref: Ref<FormItemRef>) {
    return createElement(Field<string[]>, {
      ...props,
      kind: "TagPicker",
      initial: [],
      fieldRef: ref,
    });
  }),
  {
    Item: (props: FormTagPickerItemProps) => createElement("Form.TagPicker.Item", props),
  },
);
function firstValue(children: ReactNode): string | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child)) continue;
    const value = child.props.value ?? firstValue(child.props.children);
    if (value !== undefined) return value;
  }
}
const Dropdown = Object.assign(
  forwardRef(function Dropdown(props: FormDropdownProps, ref: Ref<FormItemRef>) {
    return createElement(Field<string>, {
      ...props,
      kind: "Dropdown",
      initial: firstValue(props.children) ?? "",
      fieldRef: ref,
    });
  }),
  {
    Item: (props: FormDropdownItemProps) => createElement("Form.Dropdown.Item", props),
    Section: (props: FormDropdownSectionProps) => createElement("Form.Dropdown.Section", props),
  },
);
export const Form = Object.assign(
  function Form({ children, actions, searchBarAccessory, ...props }: FormProps) {
    const [fields] = useState<Fields>(() => new Map());
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const ctx = useMemo<FormContextValue>(
      () => ({ fields, enableDrafts: !!props.enableDrafts, focusedId, setFocusedId }),
      [fields, props.enableDrafts, focusedId],
    );
    return createElement(
      FormContext.Provider,
      { value: ctx },
      createElement(
        "Form",
        props,
        children,
        slot("actions", actions),
        slot("searchBarAccessory", searchBarAccessory),
      ),
    );
  },
  {
    FilePicker: forwardRef(FilePicker),
    TagPicker,
    PasswordField: forwardRef(PasswordField),
    TextField: forwardRef(TextField),
    TextArea: forwardRef(TextArea),
    Checkbox: forwardRef(Checkbox),
    DatePicker,
    Dropdown,
    LinkAccessory: (props: FormLinkAccessoryProps) => createElement("Form.LinkAccessory", props),
    Description: (props: FormDescriptionProps) => createElement("Form.Description", props),
    Separator: (props: Record<string, never>) => createElement("Form.Separator", props),
  },
);

export interface SubmitFormProps<T extends FormValues = FormValues> {
  title?: string;
  icon?: ImageLike;
  shortcut?: Shortcut;
  style?: "regular" | "destructive";
  onSubmit?: (input: T) => void | boolean | Promise<void | boolean>;
}
export function SubmitForm<T extends FormValues>({
  onSubmit,
  title,
  ...props
}: SubmitFormProps<T>) {
  const ctx = useContext(FormContext);
  return createElement("Action.SubmitForm", {
    ...props,
    title: title ?? "Submit Form",
    onAction: () => {
      const values = Object.fromEntries(
        Array.from(ctx?.fields ?? [], ([id, entry]) => [id, entry.read()]),
      ) as T;
      const result = onSubmit?.(values);
      if (ctx?.enableDrafts) {
        void clearDraft().catch((error: unknown) =>
          console.error("Form draft clear failed", error),
        );
      }
      return result;
    },
  });
}
