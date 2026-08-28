import {
  Children,
  Fragment,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";

import type {
  SceneEventPayload,
  SceneFormValue,
  SceneTransaction,
  ToastPayload,
  ToastStyle,
} from "@blastlauncher/scene";
import { SceneRendererError, createSceneRenderer, type SceneRenderer } from "@blastlauncher/react-renderer";

export { Color, Icon } from "./icon.js";
export type { ColorName, IconName } from "./icon.js";

/**
 * Structured error for API surface that Blast has deliberately not measured
 * or implemented yet. Unsupported behavior never fails silently.
 */
export class CompatibilityError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "CompatibilityError";
    this.code = "unsupported_api";
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface RaycastCompatContext {
  readonly descriptor: {
    readonly extensionId: string;
    readonly commandName: string;
    readonly preferences: Readonly<Record<string, string | number | boolean>>;
  };
  readonly platform: string;
  readonly publish: (transaction: SceneTransaction) => Promise<void>;
  readonly onEvent: (handler: (payload: SceneEventPayload) => void | Promise<void>) => void;
  readonly requestCapability: (request: {
    readonly capability: string;
    readonly operation: string;
    readonly arguments?: Readonly<Record<string, string | number | boolean>>;
  }) => Promise<{ readonly outcome: string; readonly value?: string | number | boolean | null }>;
  readonly showToast: (payload: ToastPayload) => Promise<void>;
}

/**
 * Command state lives on `globalThis` because a bundled extension carries its
 * own copy of this module while the bootstrap configures another; both copies
 * must share one command binding per JavaScript realm.
 */
interface RaycastCompatGlobals {
  context?: RaycastCompatContext;
  renderer?: SceneRenderer;
}

const compatGlobals: RaycastCompatGlobals = (() => {
  const holder = globalThis as typeof globalThis & { __blastRaycastCompat?: RaycastCompatGlobals };
  holder.__blastRaycastCompat ??= {};
  return holder.__blastRaycastCompat;
})();

/**
 * Binds the adapter to the running command context. The runtime bootstrap
 * calls this before invoking the extension command so module-level API
 * singletons such as `Clipboard` work.
 */
export function configureRaycastCompat(context: RaycastCompatContext): void {
  compatGlobals.context = context;
}

function requireContext(): RaycastCompatContext {
  if (compatGlobals.context === undefined) {
    throw new CompatibilityError("The Raycast compatibility API is not configured for this command");
  }
  return compatGlobals.context;
}

/**
 * Runs a Raycast-style command component: configures the API surface, renders
 * through the scene renderer, and routes scene events back to component
 * callbacks. One command per runtime. Render errors, including structured
 * compatibility errors thrown from components, fail the command loudly.
 */
export function runCommand(context: RaycastCompatContext, component: () => ReactElement): void {
  if (compatGlobals.renderer !== undefined) {
    throw new CompatibilityError("A Raycast command is already running in this runtime");
  }
  const { renderer, takeError } = createCompatRenderer(context);
  compatGlobals.renderer = renderer;
  renderLoudly(renderer, takeError, () => adaptRootElement(createElement(NavigationHost, { base: component() })));
}

/**
 * Raycast command components may be async functions; React client rendering
 * rejects them. The adapter awaits the async root once and renders the
 * resolved element.
 */
function AsyncRootAdapter({
  Component,
  props,
}: {
  readonly Component: (props: Record<string, unknown>) => unknown;
  readonly props: Record<string, unknown>;
}): ReactNode {
  const [resolved, setResolved] = useState<ReactNode>(null);
  useEffect(() => {
    let alive = true;
    void Promise.resolve(Component(props)).then((element) => {
      if (alive) {
        setResolved(isValidElement(element) ? element : null);
      }
    });
    return () => {
      alive = false;
    };
  }, [Component, props]);
  return resolved;
}

function adaptRootElement(element: ReactElement): ReactElement {
  if (
    typeof element.type === "function" &&
    (element.type as unknown as { constructor?: { name?: string } }).constructor?.name === "AsyncFunction"
  ) {
    return createElement(AsyncRootAdapter, {
      Component: element.type as (props: Record<string, unknown>) => unknown,
      props: element.props as Record<string, unknown>,
    });
  }
  return element;
}

/**
 * Renders a Raycast-style scene with a command-provided component factory and
 * returns the renderer for direct observation. Used by tests.
 */
export function renderCommand(context: RaycastCompatContext, component: () => ReactElement): SceneRenderer {
  const { renderer, takeError } = createCompatRenderer(context);
  renderLoudly(renderer, takeError, () => adaptRootElement(createElement(NavigationHost, { base: component() })));
  return renderer;
}

function renderLoudly(renderer: SceneRenderer, takeError: () => unknown, component: () => ReactElement): void {
  let renderError: unknown;
  try {
    renderer.render(component());
  } catch (error) {
    renderError = error;
  }
  const captured = takeError();
  if (captured !== undefined) {
    throw captured;
  }
  if (renderError !== undefined) {
    throw renderError;
  }
}

function createCompatRenderer(context: RaycastCompatContext): {
  renderer: SceneRenderer;
  takeError: () => unknown;
} {
  configureRaycastCompat(context);
  let capturedError: unknown;
  let capturedCompatibilityError: unknown;
  const renderer = createSceneRenderer({
    sink: {
      publish: (transaction) => context.publish(transaction),
    },
    onError: (error) => {
      if (error instanceof SceneRendererError && error.code === "empty_scene_root") {
        // The async root adapter commits an empty placeholder before the
        // resolved element arrives.
        return;
      }
      capturedError ??= error;
      if (error instanceof CompatibilityError) {
        capturedCompatibilityError ??= error;
      }
    },
  });
  context.onEvent((payload) => {
    renderer.dispatchSceneEvent(payload);
  });
  return {
    renderer,
    takeError: () => {
      const error = capturedCompatibilityError ?? capturedError;
      capturedError = undefined;
      capturedCompatibilityError = undefined;
      return error;
    },
  };
}

export interface ListProps {
  readonly navigationTitle?: string;
  readonly searchBarPlaceholder?: string;
  readonly isLoading?: boolean;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface ListItemProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconLike;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface DetailProps {
  readonly markdown?: string;
  readonly navigationTitle?: string;
}

export interface ActionPanelProps {
  readonly children?: ReactNode;
  readonly title?: string;
}

export interface SubmenuProps {
  readonly title: string;
  readonly children?: ReactNode;
}

export interface ActionProps {
  readonly title: string;
  readonly onAction?: (event?: SceneEventPayload) => void;
  readonly icon?: IconLike;
  readonly shortcut?: unknown;
  readonly style?: unknown;
}

export interface CopyToClipboardProps {
  readonly title: string;
  readonly content: string;
  readonly onCopy?: () => void;
  readonly icon?: IconLike;
}

export interface IconObject {
  readonly source: string;
  readonly tintColor?: string;
}

export type IconLike = string | IconObject;

export type FormValue = SceneFormValue;
export type FormValues = Readonly<Record<string, FormValue>>;

export interface FormProps {
  readonly navigationTitle?: string;
  readonly isLoading?: boolean;
  readonly enableDrafts?: boolean;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly searchBarAccessory?: ReactNode;
}

export interface FormItemProps<T extends FormValue> {
  readonly id: string;
  readonly title?: string;
  readonly info?: string;
  readonly error?: string;
  readonly storeValue?: boolean;
  readonly autoFocus?: boolean;
  readonly value?: T;
  readonly defaultValue?: T;
  readonly onChange?: (value: T) => void;
  readonly onFocus?: unknown;
  readonly onBlur?: unknown;
}

export interface TextFieldProps extends FormItemProps<string> {
  readonly placeholder?: string;
}

export interface TextAreaProps extends FormItemProps<string> {
  readonly placeholder?: string;
  readonly enableMarkdown?: boolean;
}

export interface PasswordFieldProps extends FormItemProps<string> {
  readonly placeholder?: string;
}

export interface CheckboxProps extends FormItemProps<boolean> {
  readonly label: string;
}

export interface DropdownItemProps {
  readonly value: string;
  readonly title: string;
  readonly icon?: IconLike;
}

export interface DropdownSectionProps {
  readonly title?: string;
  readonly children?: ReactNode;
}

export interface DropdownProps extends FormItemProps<string> {
  readonly placeholder?: string;
  readonly children?: ReactNode;
}

export interface DescriptionProps {
  readonly title?: string;
  readonly text: string;
}

export interface SeparatorProps {}

export interface SubmitFormProps<T extends FormValues = FormValues> {
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: unknown;
  readonly style?: unknown;
  readonly onSubmit?: (values: T) => void | boolean | Promise<void | boolean>;
}

function unsupported(what: string, details?: unknown): never {
  throw new CompatibilityError(`${what} is not supported by the Blast compatibility surface yet`, details);
}

function serializeIcon(
  icon: IconLike | undefined,
  where: string,
): { icon?: string; iconTintColor?: string } | undefined {
  if (icon === undefined) {
    return undefined;
  }
  if (typeof icon === "string") {
    return { icon };
  }
  if (
    typeof icon === "object" &&
    icon !== null &&
    typeof (icon as unknown as Record<string, unknown>)["source"] === "string"
  ) {
    const record = icon as { source: string; tintColor?: unknown };
    const tintColor = record.tintColor === undefined ? undefined : serializeTintColor(record.tintColor, where);
    return {
      icon: record.source,
      ...(tintColor === undefined ? {} : { iconTintColor: tintColor }),
    };
  }
  unsupported(`An icon in ${where}`, { icon });
}

function serializeTintColor(tintColor: unknown, where: string): string {
  if (typeof tintColor === "string") {
    return tintColor;
  }
  unsupported(`A tint color in ${where}`, { tintColor });
}

export function List(props: ListProps): ReactElement {
  return createElement(
    "list",
    {
      ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
      ...(props.searchBarPlaceholder === undefined ? {} : { searchBarPlaceholder: props.searchBarPlaceholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
    },
    props.children,
    props.actions,
  );
}

function ListItem(props: ListItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "List.Item");
  const children =
    props.actions === undefined
      ? props.children
      : Children.toArray([...Children.toArray(props.actions), ...Children.toArray(props.children)]);
  return createElement(
    "list-item",
    {
      title: props.title,
      ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
      ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    },
    mapItemChildren(children, "List.Item"),
  );
}

export function Detail(props: DetailProps): ReactElement {
  return createElement("detail", {
    ...(props.markdown === undefined ? {} : { markdown: props.markdown }),
    ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
  });
}

interface FormRuntime {
  readonly resetFields: () => void;
  readonly register: (
    id: string,
    initialValue: FormValue | undefined,
    controlled: boolean,
    accepts: (value: SceneFormValue) => boolean,
  ) => void;
  readonly update: (id: string, value: FormValue) => void;
  readonly submit: (values: Readonly<Record<string, SceneFormValue>> | undefined) => FormValues;
}

const FormContext: Context<FormRuntime | undefined> = createContext<FormRuntime | undefined>(undefined);

function requireFormContext(where: string): FormRuntime {
  const context = useContext(FormContext);
  if (context === undefined) {
    throw new CompatibilityError(`${where} must be rendered inside a Form`);
  }
  return context;
}

function createFormRuntime(): FormRuntime {
  const values = new Map<string, FormValue>();
  const fieldIds = new Set<string>();
  const fieldValidators = new Map<string, (value: SceneFormValue) => boolean>();

  return {
    resetFields() {
      fieldIds.clear();
      fieldValidators.clear();
    },
    register(id, initialValue, controlled, accepts) {
      if (fieldIds.has(id)) {
        throw new CompatibilityError(`The Form contains duplicate field id ${JSON.stringify(id)}`, { id });
      }
      fieldIds.add(id);
      fieldValidators.set(id, accepts);
      if (controlled || !values.has(id)) {
        if (initialValue !== undefined) {
          values.set(id, initialValue);
        } else if (controlled) {
          values.delete(id);
        }
      }
    },
    update(id, value) {
      if (fieldIds.has(id)) {
        values.set(id, value);
      }
    },
    submit(submittedValues) {
      const result: Record<string, FormValue> = {};
      for (const id of fieldIds) {
        if (submittedValues !== undefined && Object.prototype.hasOwnProperty.call(submittedValues, id)) {
          const value = submittedValues[id] as FormValue;
          const accepts = fieldValidators.get(id);
          if (accepts !== undefined && !accepts(value)) {
            throw new CompatibilityError(`Form field ${JSON.stringify(id)} received a value with the wrong type`, {
              id,
              value,
            });
          }
          Object.defineProperty(result, id, {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
          });
        } else if (values.has(id)) {
          const value = values.get(id) as FormValue;
          Object.defineProperty(result, id, {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
          });
        }
      }
      return result;
    },
  };
}

function assertFormId(id: string, where: string): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new CompatibilityError(`${where} requires a non-empty id`, { id });
  }
}

function assertFormCallbacks(props: FormItemProps<FormValue>, where: string): void {
  if (props.onChange !== undefined && typeof props.onChange !== "function") {
    throw new CompatibilityError(`${where} onChange must be a function`, { onChange: props.onChange });
  }
  if (props.onFocus !== undefined) {
    unsupported(`${where} onFocus`);
  }
  if (props.onBlur !== undefined) {
    unsupported(`${where} onBlur`);
  }
}

function useFormChange<T extends FormValue>(
  props: FormItemProps<T>,
  where: string,
  accepts: (value: SceneFormValue) => value is T,
): (payload: SceneEventPayload) => void {
  const form = requireFormContext(where);
  assertFormId(props.id, where);
  assertFormCallbacks(props as unknown as FormItemProps<FormValue>, where);
  const { id, onChange } = props;
  const initialValue = props.value !== undefined ? props.value : props.defaultValue;
  if (initialValue !== undefined && !accepts(initialValue as SceneFormValue)) {
    throw new CompatibilityError(`${where} received an initial value with the wrong type`, {
      id: props.id,
      value: initialValue,
    });
  }
  form.register(id, initialValue, props.value !== undefined, accepts);
  return useMemo(
    () => (payload: SceneEventPayload) => {
      const value = payload.values?.[id];
      if (value === undefined) {
        return;
      }
      if (!accepts(value)) {
        throw new CompatibilityError(`${where} received a value with the wrong type`, {
          id,
          value,
        });
      }
      form.update(id, value);
      onChange?.(value);
    },
    [accepts, form, id, onChange, where],
  );
}

function isStringFormValue(value: SceneFormValue): value is string {
  return typeof value === "string";
}

function isBooleanFormValue(value: SceneFormValue): value is boolean {
  return typeof value === "boolean";
}

function commonFormProps<T extends FormValue>(props: FormItemProps<T>, onChange: (payload: SceneEventPayload) => void) {
  return {
    id: props.id,
    ...(props.title === undefined ? {} : { title: props.title }),
    ...(props.info === undefined ? {} : { info: props.info }),
    ...(props.error === undefined ? {} : { error: props.error }),
    ...(props.storeValue === undefined ? {} : { storeValue: props.storeValue }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    ...(props.value === undefined ? {} : { value: props.value }),
    ...(props.defaultValue === undefined ? {} : { defaultValue: props.defaultValue }),
    onChange,
  };
}

function FormTextField(props: TextFieldProps): ReactElement {
  const onChange = useFormChange(props, "Form.TextField", isStringFormValue);
  return createElement("form-text-field", {
    ...commonFormProps(props, onChange),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
}

function FormTextArea(props: TextAreaProps): ReactElement {
  const onChange = useFormChange(props, "Form.TextArea", isStringFormValue);
  return createElement("form-text-area", {
    ...commonFormProps(props, onChange),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    ...(props.enableMarkdown === undefined ? {} : { enableMarkdown: props.enableMarkdown }),
  });
}

function FormPasswordField(props: PasswordFieldProps): ReactElement {
  const onChange = useFormChange(props, "Form.PasswordField", isStringFormValue);
  return createElement("form-password-field", {
    ...commonFormProps(props, onChange),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
}

function FormCheckbox(props: CheckboxProps): ReactElement {
  assertFormString(props.label, "Form.Checkbox label");
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: false } : props;
  const onChange = useFormChange(normalized, "Form.Checkbox", isBooleanFormValue);
  return createElement("form-checkbox", {
    ...commonFormProps(normalized, onChange),
    label: props.label,
  });
}

function FormDropdown(props: DropdownProps): ReactElement {
  const onChange = useFormChange(props, "Form.Dropdown", isStringFormValue);
  return createElement(
    "form-dropdown",
    {
      ...commonFormProps(props, onChange),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    },
    mapDropdownChildren(props.children),
  );
}

function FormDropdownItem(props: DropdownItemProps): ReactElement {
  assertFormString(props.value, "Form.Dropdown.Item value");
  assertFormString(props.title, "Form.Dropdown.Item title");
  const icon = serializeIcon(props.icon, "Form.Dropdown.Item");
  return createElement("form-dropdown-item", {
    value: props.value,
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
  });
}

function FormDropdownSection(props: DropdownSectionProps): ReactElement {
  return createElement("form-dropdown-section", { title: props.title }, mapDropdownChildren(props.children));
}

function FormDescription(props: DescriptionProps): ReactElement {
  assertFormString(props.text, "Form.Description text");
  return createElement("form-description", {
    title: props.title,
    text: props.text,
  });
}

function FormSeparator(_props: SeparatorProps): ReactElement {
  return createElement("form-separator");
}

function assertFormString(value: unknown, where: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CompatibilityError(`${where} must be a non-empty string`, { value });
  }
}

function unsupportedFormComponent(what: string): ReactElement {
  unsupported(what);
}

function FormDatePicker(_props: Record<string, unknown>): ReactElement {
  return unsupportedFormComponent("Form.DatePicker");
}

function FormTagPicker(_props: Record<string, unknown>): ReactElement {
  return unsupportedFormComponent("Form.TagPicker");
}

function FormFilePicker(_props: Record<string, unknown>): ReactElement {
  return unsupportedFormComponent("Form.FilePicker");
}

function mapFormChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Form text child", { child });
    }
    if (
      child.type === FormTextField ||
      child.type === FormTextArea ||
      child.type === FormPasswordField ||
      child.type === FormCheckbox ||
      child.type === FormDropdown ||
      child.type === FormDescription ||
      child.type === FormSeparator ||
      child.type === FormDatePicker ||
      child.type === FormTagPicker ||
      child.type === FormFilePicker ||
      child.type === ActionPanel
    ) {
      return keyedElement(child, `form-${index}`);
    }
    return unsupported("A Form child that is not a measured form item or ActionPanel", {
      childType: String(child.type),
    });
  });
}

function mapDropdownChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Form.Dropdown text child", { child });
    }
    if (child.type === FormDropdownItem || child.type === FormDropdownSection) {
      return keyedElement(child, `dropdown-${index}`);
    }
    return unsupported("A Form.Dropdown child that is not an item or section", {
      childType: String(child.type),
    });
  });
}

interface FormComponent {
  (props: FormProps): ReactElement;
  TextField: typeof FormTextField;
  TextArea: typeof FormTextArea;
  PasswordField: typeof FormPasswordField;
  Checkbox: typeof FormCheckbox;
  Dropdown: typeof FormDropdown & {
    Item: typeof FormDropdownItem;
    Section: typeof FormDropdownSection;
  };
  Description: typeof FormDescription;
  Separator: typeof FormSeparator;
  DatePicker: typeof FormDatePicker;
  TagPicker: typeof FormTagPicker;
  FilePicker: typeof FormFilePicker;
}

function FormComponent(props: FormProps): ReactElement {
  if (props.searchBarAccessory !== undefined && props.searchBarAccessory !== null) {
    unsupported("Form searchBarAccessory");
  }
  const runtime = useMemo(() => createFormRuntime(), []);
  runtime.resetFields();
  return createElement(
    FormContext.Provider,
    { value: runtime },
    createElement(
      "form",
      {
        ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
        ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
        ...(props.enableDrafts === undefined ? {} : { enableDrafts: props.enableDrafts }),
      },
      mapFormChildren(Children.toArray([props.actions, props.children])),
    ),
  );
}

export const Form: FormComponent = Object.assign(FormComponent, {
  TextField: FormTextField,
  TextArea: FormTextArea,
  PasswordField: FormPasswordField,
  Checkbox: FormCheckbox,
  Dropdown: Object.assign(FormDropdown, { Item: FormDropdownItem, Section: FormDropdownSection }),
  Description: FormDescription,
  Separator: FormSeparator,
  DatePicker: FormDatePicker,
  TagPicker: FormTagPicker,
  FilePicker: FormFilePicker,
});

function ActionPanelComponent(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel"));
}

function Submenu(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel.Submenu"));
}

function Section(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel.Section"));
}

interface ActionPanelComponent {
  (props: ActionPanelProps): ReactElement;
  Section: typeof Section;
  Submenu: typeof Submenu;
}

export const ActionPanel: ActionPanelComponent = Object.assign(ActionPanelComponent, { Section, Submenu });

function ActionComponent(props: ActionProps): ReactElement {
  if (props.shortcut !== undefined) {
    unsupported("The Action shortcut prop");
  }
  if (props.style !== undefined) {
    unsupported("The Action style prop");
  }
  const icon = serializeIcon(props.icon, "Action");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    onAction: (event: SceneEventPayload) => {
      props.onAction?.(event);
    },
  });
}

function SubmitForm<T extends FormValues = FormValues>(props: SubmitFormProps<T>): ReactElement {
  if (props.onSubmit !== undefined && typeof props.onSubmit !== "function") {
    throw new CompatibilityError("Action.SubmitForm onSubmit must be a function", { onSubmit: props.onSubmit });
  }
  const form = requireFormContext("Action.SubmitForm");
  return createElement(Action, {
    title: props.title ?? "Submit Form",
    ...(props.icon === undefined ? {} : { icon: props.icon }),
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    ...(props.style === undefined ? {} : { style: props.style }),
    onAction: (event) => {
      const values = form.submit(event?.values);
      void props.onSubmit?.(values as T);
    },
  });
}

function Push(props: {
  readonly title: string;
  readonly target: ReactElement;
  readonly icon?: IconLike;
  readonly shortcut?: unknown;
}): ReactElement {
  if (props.shortcut !== undefined) {
    unsupported("The Action.Push shortcut prop");
  }
  const icon = serializeIcon(props.icon, "Action.Push");
  const navigation = useContext(NavigationContext);
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    onAction: () => {
      navigation.push(props.target);
    },
  });
}

function CopyToClipboard(props: CopyToClipboardProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action.CopyToClipboard");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    onAction: () => {
      void copyToClipboard(props.content).then(() => props.onCopy?.());
    },
  });
}

interface ActionComponent {
  (props: ActionProps): ReactElement;
  CopyToClipboard: typeof CopyToClipboard;
  Push: typeof Push;
  SubmitForm: typeof SubmitForm;
}

export const Action: ActionComponent = Object.assign(ActionComponent, { CopyToClipboard, Push, SubmitForm });

async function copyToClipboard(text: string): Promise<void> {
  const response = await requireContext().requestCapability({
    capability: "clipboard",
    operation: "write",
    arguments: { text },
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError("The clipboard write capability was not granted", response);
  }
}

function mapItemChildren(children: ReactNode, where: string): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported(`A ${where} text child`, { child });
    }
    if (
      child.type === ActionPanel ||
      child.type === Submenu ||
      child.type === Section ||
      child.type === Action ||
      child.type === SubmitForm ||
      child.type === CopyToClipboard ||
      child.type === Push
    ) {
      return keyedElement(child, `${where}-${index}`);
    }
    return unsupported(`A ${where} child that is not an action`, { childType: String(child.type) });
  });
}

function keyedElement(child: ReactNode, key: string): ReactNode {
  return isValidElement(child) ? cloneElement(child, { key }) : child;
}

export const Clipboard = {
  async copy(text: string): Promise<void> {
    await copyToClipboard(text);
  },
  async read(): Promise<string> {
    const response = await requireContext().requestCapability({ capability: "clipboard", operation: "read" });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The clipboard read capability was not granted", response);
    }
    return typeof response.value === "string" ? response.value : "";
  },
};

Object.assign(List, { Item: ListItem });

function normalizeToastStyle(style: unknown): ToastStyle {
  return style === "success" || style === "failure" ? style : "neutral";
}

export class Toast {
  static readonly Style = {
    Success: "success",
    Failure: "failure",
  } as const;

  readonly title: string;
  readonly message: string | undefined;
  readonly style: ToastStyle;

  constructor(options: { readonly title: string; readonly message?: string; readonly style?: unknown }) {
    this.title = options.title;
    this.message = options.message;
    this.style = normalizeToastStyle(options.style);
  }

  async show(): Promise<void> {
    await requireContext().showToast(this.toPayload());
  }

  async hide(): Promise<void> {
    unsupported("Toast.hide");
  }

  toPayload(): ToastPayload {
    return {
      title: this.title,
      ...(this.message === undefined ? {} : { message: this.message }),
      style: this.style,
    };
  }
}

export interface ToastOptions {
  readonly title: string;
  readonly message?: string;
  readonly style?: unknown;
}

/**
 * Shows a toast in the client and returns the instance.
 */
export async function showToast(options: ToastOptions | string): Promise<Toast> {
  const toast =
    typeof options === "string"
      ? new Toast({ title: options })
      : new Toast({
          title: options.title,
          ...(options.message === undefined ? {} : { message: options.message }),
          style: options.style,
        });
  await toast.show();
  return toast;
}

/**
 * Returns the command's preference values: manifest defaults resolved by the
 * trusted catalog today, user overrides once preference storage exists.
 */
export function getPreferenceValues<T = Record<string, string | number | boolean>>(): T {
  return requireContext().descriptor.preferences as T;
}

export interface NavigationApi {
  push(element: ReactElement): void;
  pop(): void;
  popToRoot(): void;
}

const NavigationContext: Context<NavigationApi> = createContext<NavigationApi>({
  push() {},
  pop() {},
  popToRoot() {},
});

/**
 * Navigation within a running command. Pushed views stay mounted, so their
 * state survives popping; only the top view contributes scene nodes.
 */
export function useNavigation(): NavigationApi {
  return useContext(NavigationContext);
}

let navigationEntryCounter = 0;

function NavigationHost({ base }: { readonly base: ReactElement }): ReactElement {
  const [entries, setEntries] = useState<{ readonly id: number; readonly element: ReactElement }[]>([
    { id: ++navigationEntryCounter, element: base },
  ]);
  const navigation = useMemo<NavigationApi>(
    () => ({
      push(element: ReactElement) {
        setEntries((current) => [...current, { id: ++navigationEntryCounter, element }]);
      },
      pop() {
        setEntries((current) => (current.length > 1 ? current.slice(0, -1) : current));
      },
      popToRoot() {
        setEntries((current) => (current.length > 1 ? current.slice(0, 1) : current));
      },
    }),
    [],
  );

  return createElement(
    NavigationContext.Provider,
    { value: navigation },
    entries.map((entry, index) =>
      createElement(Fragment, { key: entry.id }, index === entries.length - 1 ? entry.element : null),
    ),
  );
}

export const LaunchType = {
  InitialLaunch: "initial-launch",
  HotReload: "hot-reload",
  BackgroundCheck: "background-check",
} as const;

export type LaunchTypeName = (typeof LaunchType)[keyof typeof LaunchType];

export interface Environment {
  os: readonly [string];
  launchType: LaunchTypeName;
  commandName: string;
  extensionName: string;
  raycastVersion: string;
}

/**
 * Runtime environment for the running command. `raycastVersion` reports the
 * compatibility target the adapter implements.
 */
export function environment(): Environment {
  const context = requireContext();
  const osName = context.platform === "darwin" ? "macOS" : context.platform === "win32" ? "Windows" : "Linux";
  return {
    os: [osName],
    launchType: LaunchType.InitialLaunch,
    commandName: context.descriptor.commandName,
    extensionName: context.descriptor.extensionId,
    raycastVersion: "1.79.0",
  };
}

/**
 * Per-extension key-value storage, brokered through the capability boundary
 * with the extension identity attached by the host.
 */
export const LocalStorage = {
  async getItem<T extends string | number | boolean>(key: string): Promise<T | undefined> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "get",
      arguments: { key },
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage get capability was not granted", response);
    }
    return response.value === undefined || response.value === null ? undefined : (response.value as T);
  },

  async setItem(key: string, value: string | number | boolean): Promise<void> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "set",
      arguments: { key, value },
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage set capability was not granted", response);
    }
  },

  async removeItem(key: string): Promise<void> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "remove",
      arguments: { key },
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage remove capability was not granted", response);
    }
  },

  async clear(): Promise<void> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "clear",
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage clear capability was not granted", response);
    }
  },
};
