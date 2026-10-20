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
import type { JsonValue } from "../reconciler/index.ts";
import { requestCapability } from "./capability.ts";
import { DatePickerType } from "./enums.generated.ts";
import { environment } from "./environment.ts";
import { RootNavigationEntryContext } from "./navigation.ts";
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

type Fields = Map<
  string,
  {
    read: () => FormValue;
    secret: boolean;
    event: (type: "focus" | "blur") => void;
  }
>;
let launchDraft: FormValues | undefined;
/** Installed before importing the command, alongside its launch props. */
export function setFormDraftValues(values: FormValues | undefined): void {
  launchDraft = values;
}
interface FormContextValue {
  fields: Fields;
  enableDrafts: boolean;
  focusedId: string | null;
  focus: (id: string | null) => void;
  blur: (id: string) => void;
  draft: FormValues | undefined;
}
const FormContext = createContext<FormContextValue | null>(null);

// A Date does not round-trip through JSON; everything else in `FormValue`
// does, so only Dates need a tagged encoding.
function encodeValue(value: FormValue): unknown {
  return value instanceof Date ? { $date: value.toISOString() } : value;
}
function decodeValue(value: unknown): FormValue {
  if (value && typeof value === "object" && !Array.isArray(value) && "$date" in value) {
    const date = new Date((value as { $date: string }).$date);
    if (Number.isFinite(date.getTime())) return date;
    throw new Error("Invalid stored Form date");
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) &&
      (value.every((v) => typeof v === "string") ||
        value.every((v) => typeof v === "number" && Number.isFinite(v))))
  )
    return value as FormValue;
  throw new Error("Invalid stored Form value");
}
/** Decodes a stored or wire-carried values object back into typed `FormValue`s. */
export function decodeFormValues(values: Record<string, unknown>): FormValues {
  const result: FormValues = {};
  for (const [id, value] of Object.entries(values)) {
    try {
      Object.defineProperty(result, id, { value: decodeValue(value), enumerable: true });
    } catch {
      /* Ignore stale or malformed draft entries. */
    }
  }
  return result;
}

function fieldKey(id: string): string {
  return `blast:field:${JSON.stringify([environment.commandName, id])}`;
}
function draftKey(): string {
  return `blast:draft:${environment.commandName}`;
}
const pendingWrites = new Set<Promise<JsonValue>>();
function writeStorage(name: string, params: Record<string, JsonValue>): Promise<JsonValue> {
  const promise = requestCapability(name, params);
  pendingWrites.add(promise);
  void promise.then(
    () => pendingWrites.delete(promise),
    () => pendingWrites.delete(promise),
  );
  return promise;
}
/** Graceful shutdown must receive the host's write acknowledgements before exiting. */
export async function flushFormPersistence(): Promise<void> {
  await Promise.allSettled(pendingWrites);
}
async function saveDraft(fields: Fields, id: string, next: FormValue): Promise<void> {
  const values: Record<string, unknown> = {};
  for (const [fieldId, entry] of fields) {
    if (!entry.secret) values[fieldId] = encodeValue(entry.read());
  }
  values[id] = encodeValue(next);
  await writeStorage("storage.set", {
    scope: "blast:internal",
    key: draftKey(),
    value: JSON.stringify(values),
  });
}
async function clearDraft(): Promise<void> {
  await writeStorage("storage.remove", { scope: "blast:internal", key: draftKey() });
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
  const draft = !secret ? ctx?.draft?.[props.id] : undefined;
  const [local, setLocal] = useState(
    (draft !== undefined ? draft : (props.defaultValue ?? initial)) as T,
  );
  const value = props.value !== undefined ? props.value : local;
  const current = useRef(value);
  current.current = value;
  const edited = useRef(false);
  const key = fieldKey(props.id);

  // Restoring a stored value behaves like an uncontrolled `defaultValue`
  // update that arrives after mount; a concurrent edit always wins.
  useEffect(() => {
    if (secret || draft !== undefined || !props.storeValue || props.value !== undefined) return;
    let mounted = true;
    void requestCapability("storage.get", { scope: "blast:internal", key })
      .then((stored) => {
        if (!mounted || edited.current || typeof stored !== "string") return;
        const restored = decodeValue(JSON.parse(stored)) as T;
        if (
          kind === "DatePicker"
            ? restored !== null && !(restored instanceof Date)
            : Array.isArray(initial)
              ? !Array.isArray(restored) || !restored.every((v) => typeof v === "string")
              : typeof restored !== typeof initial
        )
          return;
        current.current = restored;
        setLocal(restored);
        props.onChange?.(restored);
      })
      .catch((error: unknown) => console.error("Form field restore failed", error));
    return () => {
      mounted = false;
    };
  }, [key, secret, draft, props.storeValue, props.value]);

  const callbacks = useRef(props);
  callbacks.current = props;
  useLayoutEffect(() => {
    if (!ctx) return;
    const read = () => current.current;
    ctx.fields.set(props.id, {
      read,
      secret: !!secret,
      event: (type) => {
        const callback = type === "focus" ? callbacks.current.onFocus : callbacks.current.onBlur;
        callback?.({ target: { id: props.id, value: current.current }, type });
      },
    });
    return () => {
      if (ctx.fields.get(props.id)?.read === read) ctx.fields.delete(props.id);
    };
  }, [ctx?.fields, props.id, secret]);

  useEffect(() => {
    if (props.autoFocus) ctx?.focus(props.id);
  }, [ctx?.focus, props.id, props.autoFocus]);

  function change(next: T) {
    edited.current = true;
    if (props.value === undefined) {
      current.current = next;
      setLocal(next);
    }
    props.onChange?.(next);
    if (secret) return;
    if (props.storeValue) {
      void writeStorage("storage.set", {
        scope: "blast:internal",
        key,
        value: JSON.stringify(encodeValue(next)),
      }).catch((error: unknown) => console.error("Form field save failed", error));
    }
    if (ctx?.enableDrafts) {
      void saveDraft(ctx.fields, props.id, next).catch((error: unknown) =>
        console.error("Form draft save failed", error),
      );
    }
  }

  useImperativeHandle(
    fieldRef,
    (): FormItemRef => ({
      focus: () => ctx?.focus(props.id),
      reset: () => change((props.defaultValue ?? initial) as T),
    }),
    [ctx, props, initial],
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
      change(next);
    },
    onFocus: () => ctx?.focus(props.id),
    onBlur: () => {
      ctx?.blur(props.id);
    },
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
  return createElement(Field<boolean>, {
    ...props,
    kind: "Checkbox",
    initial: false,
    fieldRef: ref,
  });
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
    const parent = useContext(FormContext);
    const rootEntry = useContext(RootNavigationEntryContext);
    const enableDrafts = rootEntry && !parent && !!props.enableDrafts;
    const [draft] = useState(() => (enableDrafts ? launchDraft : undefined));
    const manager = useMemo(() => {
      let active: string | null = null;
      const focus = (id: string | null) => {
        if (id === active) return;
        if (active !== null) fields.get(active)?.event("blur");
        active = id;
        setFocusedId(id);
        if (id !== null) fields.get(id)?.event("focus");
      };
      return {
        focus,
        blur: (id: string) => {
          if (active === id) focus(null);
        },
      };
    }, [fields]);
    const ctx = useMemo<FormContextValue>(
      () => ({
        fields,
        enableDrafts,
        focusedId,
        ...manager,
        draft,
      }),
      [fields, enableDrafts, focusedId, manager, draft],
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
  const [submissionFailureCount, setSubmissionFailureCount] = useState(0);
  return createElement("Action.SubmitForm", {
    submissionFailureCount,
    ...props,
    title: title ?? "Submit Form",
    onAction: () => {
      const values = Object.fromEntries(
        Array.from(ctx?.fields ?? [], ([id, entry]) => [id, entry.read()]),
      ) as T;
      const result = onSubmit?.(values);
      const complete = (success: void | boolean) => {
        if (success === false) setSubmissionFailureCount((count) => count + 1);
        if (ctx?.enableDrafts && success !== false) {
          void clearDraft().catch((error: unknown) =>
            console.error("Form draft clear failed", error),
          );
        }
        return success;
      };
      return result instanceof Promise ? result.then(complete) : complete(result);
    },
  });
}

// `Action.SubmitForm` and its deprecated alias declare a `displayName`.
SubmitForm.displayName = "SubmitForm";
