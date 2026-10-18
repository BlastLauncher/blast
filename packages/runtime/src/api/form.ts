import {
  Children,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DatePickerType } from "./enums.generated.ts";
import { slot } from "./slot.ts";
import type { ImageLike, Shortcut } from "./types.ts";

export type FormValue = string | number | boolean | string[] | number[] | Date | null;
export type FormValues = Record<string, FormValue>;
export interface FormEvent<T extends FormValue> {
  target: { id: string; value?: T };
  type: "focus" | "blur";
}
export interface FormItemProps<T extends FormValue> {
  id: string;
  title?: string;
  info?: string;
  error?: string;
  /** Recorded only; persisted field values are not implemented yet. */
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
  /** Recorded only; drafts are outside the supported Form surface. */
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

type Fields = Map<string, () => FormValue>;
const FormContext = createContext<Fields | null>(null);

function Field<T extends string | string[] | boolean | Date | null>({
  kind,
  initial,
  ...props
}: FormItemProps<T> & { kind: string; initial: T; children?: ReactNode }) {
  const fields = useContext(FormContext);
  const [local, setLocal] = useState(props.defaultValue ?? initial);
  const value = props.value !== undefined ? props.value : local;
  const current = useRef(value);
  current.current = value;
  useLayoutEffect(() => {
    if (!fields) return;
    const read = () => current.current;
    fields.set(props.id, read);
    return () => {
      if (fields.get(props.id) === read) fields.delete(props.id);
    };
  }, [fields, props.id]);
  return createElement(`Form.${kind}`, {
    ...props,
    value,
    onChange: (input: T | string) => {
      // Dates arrive from clients as ISO strings; extension callbacks see Dates.
      const next = (
        kind === "DatePicker" && typeof input === "string" ? new Date(input) : input
      ) as T;
      if (props.value === undefined) {
        current.current = next;
        setLocal(next);
      }
      props.onChange?.(next);
    },
    onFocus: props.onFocus
      ? () => props.onFocus?.({ target: { id: props.id, value: current.current }, type: "focus" })
      : undefined,
    onBlur: props.onBlur
      ? () => props.onBlur?.({ target: { id: props.id, value: current.current }, type: "blur" })
      : undefined,
  });
}

function TextField(props: FormTextFieldProps) {
  return createElement(Field<string>, { ...props, kind: "TextField", initial: "" });
}
function TextArea(props: FormTextAreaProps) {
  return createElement(Field<string>, { ...props, kind: "TextArea", initial: "" });
}
function Checkbox(props: FormCheckboxProps) {
  return createElement(Field<boolean>, { ...props, kind: "Checkbox", initial: false });
}
const DatePicker = Object.assign(
  function DatePicker(props: FormDatePickerProps) {
    return createElement(Field<Date | null>, { ...props, kind: "DatePicker", initial: null });
  },
  { Type: DatePickerType },
);
function FilePicker(props: FormFilePickerProps) {
  return createElement(Field<string[]>, {
    allowMultipleSelection: true,
    canChooseDirectories: false,
    canChooseFiles: true,
    showHiddenFiles: false,
    ...props,
    kind: "FilePicker",
    initial: [],
  });
}
function firstValue(children: ReactNode): string | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child)) continue;
    const value = child.props.value ?? firstValue(child.props.children);
    if (value !== undefined) return value;
  }
}
const Dropdown = Object.assign(
  function Dropdown(props: FormDropdownProps) {
    return createElement(Field<string>, {
      ...props,
      kind: "Dropdown",
      initial: firstValue(props.children) ?? "",
    });
  },
  {
    Item: (props: FormDropdownItemProps) => createElement("Form.Dropdown.Item", props),
    Section: (props: FormDropdownSectionProps) => createElement("Form.Dropdown.Section", props),
  },
);
export const Form = Object.assign(
  function Form({ children, actions, searchBarAccessory, ...props }: FormProps) {
    const [fields] = useState<Fields>(() => new Map());
    return createElement(
      FormContext.Provider,
      { value: fields },
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
    FilePicker,
    TextField,
    TextArea,
    Checkbox,
    DatePicker,
    Dropdown,
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
  const fields = useContext(FormContext);
  return createElement("Action.SubmitForm", {
    ...props,
    title: title ?? "Submit Form",
    onAction: () =>
      onSubmit?.(Object.fromEntries(Array.from(fields ?? [], ([id, read]) => [id, read()])) as T),
  });
}
