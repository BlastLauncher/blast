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
  SceneShortcut,
  SceneTransaction,
  ToastActionPayload,
  ToastOperation,
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
  toastEvents?: Map<string, () => void>;
  cacheStores?: Map<string, CacheState>;
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
  compatGlobals.toastEvents ??= new Map();
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
  const toastEvents = new Map<string, () => void>();
  compatGlobals.toastEvents = toastEvents;
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
    try {
      renderer.dispatchSceneEvent(payload);
    } catch (error) {
      if (!(error instanceof SceneRendererError) || error.code !== "unknown_event") {
        throw error;
      }
      const toastHandler = toastEvents.get(payload.eventId);
      if (toastHandler === undefined) {
        throw error;
      }
      toastHandler();
    }
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
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly autoFocus?: boolean;
  readonly children?: ReactNode;
}

export interface ActionProps {
  readonly title: string;
  readonly onAction?: (event?: SceneEventPayload) => void;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
}

export interface CopyToClipboardProps {
  readonly title: string;
  readonly content: string;
  readonly onCopy?: () => void;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
}

export interface IconObject {
  readonly source: string;
  readonly tintColor?: string;
}

export type IconLike = string | IconObject;

export type KeyModifier = "cmd" | "ctrl" | "opt" | "shift" | "alt" | "windows";
export type KeyEquivalent = string;
export type ShortcutLike =
  | {
      readonly modifiers: readonly KeyModifier[];
      readonly key: KeyEquivalent;
    }
  | {
      readonly macOS: {
        readonly modifiers: readonly KeyModifier[];
        readonly key: KeyEquivalent;
      };
      readonly Windows: {
        readonly modifiers: readonly KeyModifier[];
        readonly key: KeyEquivalent;
      };
      readonly windows?: {
        readonly modifiers: readonly KeyModifier[];
        readonly key: KeyEquivalent;
      };
    };
export type KeyboardShortcut = ShortcutLike;
export type ActionStyleLike = "regular" | "destructive";
export type AlertActionStyleLike = "default" | "cancel" | "destructive";

export interface AlertActionOptions {
  readonly title: string;
  readonly style?: AlertActionStyleLike;
  readonly onAction?: () => void;
}

export interface AlertOptions {
  readonly title: string;
  readonly icon?: IconLike;
  readonly message?: string;
  readonly primaryAction?: AlertActionOptions;
  readonly dismissAction?: AlertActionOptions;
  readonly rememberUserChoice?: boolean;
}

export interface ApplicationLike {
  readonly name?: string;
  readonly localizedName?: string;
  readonly path?: string;
  readonly bundleId?: string;
  readonly windowsAppId?: string;
}

export interface CacheOptions {
  /** Separates cache entries while keeping the default shared per extension. */
  readonly namespace?: string;
  /** Retained for source compatibility; V2 currently exposes session-local storage. */
  readonly directory?: string;
  /** Maximum UTF-8 byte size before least-recently-used entries are evicted. */
  readonly capacity?: number;
}

export type CacheSubscriber = (key: string | undefined, data: string | undefined) => void;
export type CacheSubscription = () => void;

interface CacheState {
  readonly storage: Map<string, string>;
  readonly subscribers: Set<CacheSubscriber>;
}

export const Keyboard = {
  Shortcut: {
    Common: {
      Copy: { modifiers: ["cmd"], key: "c" },
      CopyDeeplink: { modifiers: ["cmd", "shift"], key: "c" },
      CopyName: { modifiers: ["cmd", "shift"], key: "n" },
      CopyPath: { modifiers: ["cmd", "shift"], key: "p" },
      Save: { modifiers: ["cmd"], key: "s" },
      Duplicate: { modifiers: ["cmd"], key: "d" },
      Edit: { modifiers: ["cmd"], key: "e" },
      MoveDown: { modifiers: ["cmd"], key: "arrowDown" },
      MoveUp: { modifiers: ["cmd"], key: "arrowUp" },
      New: { modifiers: ["cmd"], key: "n" },
      Open: { modifiers: ["cmd"], key: "o" },
      OpenWith: { modifiers: ["cmd", "shift"], key: "o" },
      Pin: { modifiers: ["cmd"], key: "p" },
      Refresh: { modifiers: ["cmd"], key: "r" },
      Remove: { modifiers: ["cmd"], key: "backspace" },
      RemoveAll: { modifiers: ["cmd", "shift"], key: "backspace" },
      ToggleQuickLook: { modifiers: [], key: "space" },
    },
  },
} as const;

export const PopToRootType = {
  Default: "default",
  Immediate: "immediate",
  Suspended: "suspended",
} as const;

export type PopToRootType = (typeof PopToRootType)[keyof typeof PopToRootType];

export const Alert = {
  ActionStyle: {
    Default: "default",
    Cancel: "cancel",
    Destructive: "destructive",
  },
} as const;

export const ActionStyle = {
  Regular: "regular",
  Destructive: "destructive",
} as const;

/**
 * These placeholders keep widely used utility packages loadable when they
 * import the broader Raycast namespace. Calling an unmeasured API still fails
 * loudly at the point of use; the placeholders are not compatibility support.
 */
function UnsupportedComponent(): ReactElement {
  return unsupported("An unmeasured component API");
}

export const MenuBarExtra = Object.assign(UnsupportedComponent, {
  Item: UnsupportedComponent,
  Separator: UnsupportedComponent,
});

export const AI = {
  async ask(): Promise<never> {
    return unsupported("AI.ask");
  },
};

class UnsupportedOAuthClient {
  constructor() {
    unsupported("OAuth.PKCEClient");
  }
}

export const OAuth = {
  PKCEClient: UnsupportedOAuthClient,
  RedirectMethod: {
    Web: "web",
    AppURI: "app-uri",
  },
} as const;

export type FormValue = string | boolean | null | string[] | Date;
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

export type DatePickerType = "date" | "date_time";

export interface DatePickerProps extends FormItemProps<Date | null> {
  readonly type?: DatePickerType;
  readonly min?: Date;
  readonly max?: Date;
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

export interface TagPickerItemProps {
  readonly value: string;
  readonly title: string;
  readonly icon?: IconLike;
}

export interface TagPickerProps extends FormItemProps<string[]> {
  readonly placeholder?: string;
  readonly children?: ReactNode;
}

export interface FilePickerProps extends FormItemProps<string[]> {
  readonly canChooseFiles?: boolean;
  readonly canChooseDirectories?: boolean;
  readonly showHiddenFiles?: boolean;
  readonly allowMultipleSelection?: boolean;
}

export interface DescriptionProps {
  readonly title?: string;
  readonly text: string;
}

export interface SeparatorProps {}

export interface SubmitFormProps<T extends FormValues = FormValues> {
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly onSubmit?: (values: T) => void | boolean | Promise<void | boolean>;
}

function unsupported(what: string, details?: unknown): never {
  throw new CompatibilityError(`${what} is not supported by the Blast compatibility surface yet`, details);
}

function serializeIcon(
  icon: IconLike | undefined,
  where: string,
): { icon: string; iconTintColor?: string } | undefined {
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

const SHORTCUT_MODIFIERS = new Set<KeyModifier>(["cmd", "ctrl", "opt", "shift", "alt", "windows"]);

/**
 * Normalizes Raycast's keyboard shortcut union into the structured scene
 * representation. The platform-specific form is selected at render time so
 * the client never has to understand Raycast's deprecated `windows` alias.
 */
function serializeShortcut(shortcut: unknown, where: string): SceneShortcut | undefined {
  if (shortcut === undefined || shortcut === null) {
    return undefined;
  }
  if (!isRecord(shortcut)) {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }

  const context = requireContext();
  const selected =
    "modifiers" in shortcut
      ? shortcut
      : context.platform === "darwin"
        ? (shortcut["macOS"] ?? shortcut["Windows"] ?? shortcut["windows"])
        : (shortcut["Windows"] ?? shortcut["windows"] ?? shortcut["macOS"]);
  if (!isRecord(selected) || !Array.isArray(selected.modifiers) || typeof selected.key !== "string") {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }
  const rawModifiers = selected.modifiers;
  const key = selected.key;
  if (!Array.isArray(rawModifiers) || typeof key !== "string") {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }
  if (
    rawModifiers.some((modifier) => typeof modifier !== "string" || !SHORTCUT_MODIFIERS.has(modifier as KeyModifier))
  ) {
    unsupported(`A shortcut modifier in ${where}`, { shortcut });
  }
  const modifiers = rawModifiers as string[];
  if (new Set(modifiers).size !== modifiers.length || key.length === 0) {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }
  return { modifiers: [...modifiers], key };
}

function normalizeActionStyle(style: unknown, where: string): ActionStyleLike | undefined {
  if (style === undefined || style === null) {
    return undefined;
  }
  if (style === "regular" || style === "destructive") {
    return style;
  }
  unsupported(`An action style in ${where}`, { style });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) {
    unsupported(`${where} must be a non-empty string`, { value });
  }
  return value;
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

interface FormCodec {
  readonly accepts: (value: unknown) => boolean;
  readonly acceptsWire: (value: SceneFormValue) => boolean;
  readonly serialize: (value: unknown) => SceneFormValue;
  readonly deserialize: (value: SceneFormValue) => FormValue;
}

interface FormRuntime {
  readonly resetFields: () => void;
  readonly register: (id: string, initialValue: FormValue | undefined, controlled: boolean, codec: FormCodec) => void;
  readonly update: (id: string, value: SceneFormValue) => void;
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
  const values = new Map<string, SceneFormValue>();
  const fieldIds = new Set<string>();
  const fieldCodecs = new Map<string, FormCodec>();

  return {
    resetFields() {
      fieldIds.clear();
      fieldCodecs.clear();
    },
    register(id, initialValue, controlled, codec) {
      if (fieldIds.has(id)) {
        throw new CompatibilityError(`The Form contains duplicate field id ${JSON.stringify(id)}`, { id });
      }
      fieldIds.add(id);
      fieldCodecs.set(id, codec);
      if (controlled || !values.has(id)) {
        if (initialValue !== undefined) {
          values.set(id, codec.serialize(initialValue));
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
          const value = submittedValues[id] as SceneFormValue;
          const codec = fieldCodecs.get(id);
          if (codec !== undefined && !codec.acceptsWire(value)) {
            throw new CompatibilityError(`Form field ${JSON.stringify(id)} received a value with the wrong type`, {
              id,
              value,
            });
          }
          const formValue = codec === undefined ? value : codec.deserialize(value);
          Object.defineProperty(result, id, {
            configurable: true,
            enumerable: true,
            value: formValue,
            writable: true,
          });
        } else if (values.has(id)) {
          const value = values.get(id) as SceneFormValue;
          const codec = fieldCodecs.get(id);
          const formValue = codec === undefined ? value : codec.deserialize(value);
          Object.defineProperty(result, id, {
            configurable: true,
            enumerable: true,
            value: formValue,
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
  codec: FormCodec,
): (payload: SceneEventPayload) => void {
  const form = requireFormContext(where);
  assertFormId(props.id, where);
  assertFormCallbacks(props as unknown as FormItemProps<FormValue>, where);
  const { id, onChange } = props;
  const initialValue = props.value !== undefined ? props.value : props.defaultValue;
  if (initialValue !== undefined && !codec.accepts(initialValue)) {
    throw new CompatibilityError(`${where} received an initial value with the wrong type`, {
      id: props.id,
      value: initialValue,
    });
  }
  form.register(id, initialValue, props.value !== undefined, codec);
  return useMemo(
    () => (payload: SceneEventPayload) => {
      const value = payload.values?.[id];
      if (value === undefined) {
        return;
      }
      if (!codec.acceptsWire(value)) {
        throw new CompatibilityError(`${where} received a value with the wrong type`, {
          id,
          value,
        });
      }
      form.update(id, value);
      onChange?.(codec.deserialize(value) as T);
    },
    [codec, form, id, onChange, where],
  );
}

function isStringFormValue(value: unknown): value is string {
  return typeof value === "string";
}

function isBooleanFormValue(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArrayFormValue(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDateFormValue(value: unknown): value is Date | null {
  return value === null || (value instanceof Date && Number.isFinite(value.getTime()));
}

function isDateWireValue(value: SceneFormValue): boolean {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

const stringFormCodec: FormCodec = {
  accepts: isStringFormValue,
  acceptsWire: isStringFormValue,
  serialize: (value) => value as string,
  deserialize: (value) => value as string,
};

const booleanFormCodec: FormCodec = {
  accepts: isBooleanFormValue,
  acceptsWire: isBooleanFormValue,
  serialize: (value) => value as boolean,
  deserialize: (value) => value as boolean,
};

const stringArrayFormCodec: FormCodec = {
  accepts: isStringArrayFormValue,
  acceptsWire: isStringArrayFormValue,
  serialize: (value) => [...(value as string[])],
  deserialize: (value) => [...(value as readonly string[])],
};

const dateFormCodec: FormCodec = {
  accepts: isDateFormValue,
  acceptsWire: isDateWireValue,
  serialize: (value) => (value === null ? null : (value as Date).toISOString()),
  deserialize: (value) => (value === null ? null : new Date(value as string)),
};

function commonFormProps<T extends FormValue>(
  props: FormItemProps<T>,
  onChange: (payload: SceneEventPayload) => void,
  codec: FormCodec,
) {
  const value = props.value === undefined ? undefined : codec.serialize(props.value);
  const defaultValue = props.defaultValue === undefined ? undefined : codec.serialize(props.defaultValue);
  return {
    id: props.id,
    ...(props.title === undefined ? {} : { title: props.title }),
    ...(props.info === undefined ? {} : { info: props.info }),
    ...(props.error === undefined ? {} : { error: props.error }),
    ...(props.storeValue === undefined ? {} : { storeValue: props.storeValue }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    ...(value === undefined || value === null ? {} : { value }),
    ...(defaultValue === undefined || defaultValue === null ? {} : { defaultValue }),
    onChange,
  };
}

function FormTextField(props: TextFieldProps): ReactElement {
  const onChange = useFormChange(props, "Form.TextField", stringFormCodec);
  return createElement("form-text-field", {
    ...commonFormProps(props, onChange, stringFormCodec),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
}

function FormTextArea(props: TextAreaProps): ReactElement {
  const onChange = useFormChange(props, "Form.TextArea", stringFormCodec);
  return createElement("form-text-area", {
    ...commonFormProps(props, onChange, stringFormCodec),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    ...(props.enableMarkdown === undefined ? {} : { enableMarkdown: props.enableMarkdown }),
  });
}

function FormPasswordField(props: PasswordFieldProps): ReactElement {
  const onChange = useFormChange(props, "Form.PasswordField", stringFormCodec);
  return createElement("form-password-field", {
    ...commonFormProps(props, onChange, stringFormCodec),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
}

function FormCheckbox(props: CheckboxProps): ReactElement {
  assertFormString(props.label, "Form.Checkbox label");
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: false } : props;
  const onChange = useFormChange(normalized, "Form.Checkbox", booleanFormCodec);
  return createElement("form-checkbox", {
    ...commonFormProps(normalized, onChange, booleanFormCodec),
    label: props.label,
  });
}

function FormDropdown(props: DropdownProps): ReactElement {
  const onChange = useFormChange(props, "Form.Dropdown", stringFormCodec);
  return createElement(
    "form-dropdown",
    {
      ...commonFormProps(props, onChange, stringFormCodec),
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

const DATE_PICKER_TYPES = {
  Date: "date",
  DateTime: "date_time",
} as const;

function normalizeDatePickerType(type: unknown): DatePickerType {
  if (type === undefined) {
    return DATE_PICKER_TYPES.DateTime;
  }
  if (type === DATE_PICKER_TYPES.Date || type === DATE_PICKER_TYPES.DateTime) {
    return type;
  }
  throw new CompatibilityError("Form.DatePicker type must be Form.DatePicker.Type.Date or DateTime", { type });
}

function serializeDatePickerValue(value: unknown, where: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new CompatibilityError(`${where} must be a valid Date`, { value });
  }
  return value.toISOString();
}

function isFullDayDate(date?: Date | null): boolean {
  return (
    date === undefined ||
    date === null ||
    (date instanceof Date &&
      Number.isFinite(date.getTime()) &&
      date.getHours() === 0 &&
      date.getMinutes() === 0 &&
      date.getSeconds() === 0 &&
      date.getMilliseconds() === 0)
  );
}

function FormDatePicker(props: DatePickerProps): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: null } : props;
  const onChange = useFormChange(normalized, "Form.DatePicker", dateFormCodec);
  const type = normalizeDatePickerType(props.type);
  const min = props.min === undefined ? undefined : serializeDatePickerValue(props.min, "Form.DatePicker min");
  const max = props.max === undefined ? undefined : serializeDatePickerValue(props.max, "Form.DatePicker max");
  return createElement("form-date-picker", {
    ...commonFormProps(normalized, onChange, dateFormCodec),
    type,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  });
}

const DatePicker = Object.assign(FormDatePicker, {
  Type: DATE_PICKER_TYPES,
  isFullDay: isFullDayDate,
});

function FormTagPickerItem(props: TagPickerItemProps): ReactElement {
  assertFormString(props.value, "Form.TagPicker.Item value");
  assertFormString(props.title, "Form.TagPicker.Item title");
  const icon = serializeIcon(props.icon, "Form.TagPicker.Item");
  return createElement("form-tag-picker-item", {
    value: props.value,
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
  });
}

function FormTagPicker(props: TagPickerProps): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: [] } : props;
  const onChange = useFormChange(normalized, "Form.TagPicker", stringArrayFormCodec);
  return createElement(
    "form-tag-picker",
    {
      ...commonFormProps(normalized, onChange, stringArrayFormCodec),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    },
    mapTagPickerChildren(props.children),
  );
}

const TagPicker = Object.assign(FormTagPicker, { Item: FormTagPickerItem });

function FormFilePicker(props: FilePickerProps): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: [] } : props;
  const onChange = useFormChange(normalized, "Form.FilePicker", stringArrayFormCodec);
  return createElement("form-file-picker", {
    ...commonFormProps(normalized, onChange, stringArrayFormCodec),
    ...(props.canChooseFiles === undefined ? {} : { canChooseFiles: props.canChooseFiles }),
    ...(props.canChooseDirectories === undefined ? {} : { canChooseDirectories: props.canChooseDirectories }),
    ...(props.showHiddenFiles === undefined ? {} : { showHiddenFiles: props.showHiddenFiles }),
    ...(props.allowMultipleSelection === undefined ? {} : { allowMultipleSelection: props.allowMultipleSelection }),
  });
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
      child.type === DatePicker ||
      child.type === TagPicker ||
      child.type === FormFilePicker ||
      child.type === FormDescription ||
      child.type === FormSeparator ||
      child.type === ActionPanel
    ) {
      return keyedElement(child, `form-${index}`);
    }
    return unsupported("A Form child that is not a measured form item or ActionPanel", {
      childType: String(child.type),
    });
  });
}

function mapTagPickerChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Form.TagPicker text child", { child });
    }
    if (child.type === FormTagPickerItem) {
      return keyedElement(child, `tag-picker-${index}`);
    }
    return unsupported("A Form.TagPicker child that is not an item", {
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
  DatePicker: typeof DatePicker;
  TagPicker: typeof TagPicker;
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
  DatePicker,
  TagPicker,
  FilePicker: FormFilePicker,
});

function ActionPanelComponent(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel"));
}

function Submenu(props: SubmenuProps): ReactElement {
  const icon = serializeIcon(props.icon, "ActionPanel.Submenu");
  const shortcut = serializeShortcut(props.shortcut, "ActionPanel.Submenu");
  return createElement(
    "action-group",
    {
      title: props.title,
      ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
      ...(shortcut === undefined ? {} : { shortcut }),
      ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    },
    mapItemChildren(props.children, "ActionPanel.Submenu"),
  );
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
  const icon = serializeIcon(props.icon, "Action");
  const shortcut = serializeShortcut(props.shortcut, "Action");
  const style = normalizeActionStyle(props.style, "Action");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(style === undefined ? {} : { style }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
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
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
}): ReactElement {
  const icon = serializeIcon(props.icon, "Action.Push");
  const shortcut = serializeShortcut(props.shortcut, "Action.Push");
  const style = normalizeActionStyle(props.style, "Action.Push");
  const navigation = useContext(NavigationContext);
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(style === undefined ? {} : { style }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    onAction: () => {
      navigation.push(props.target);
    },
  });
}

function CopyToClipboard(props: CopyToClipboardProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action.CopyToClipboard");
  const shortcut = serializeShortcut(props.shortcut, "Action.CopyToClipboard");
  const style = normalizeActionStyle(props.style, "Action.CopyToClipboard");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(style === undefined ? {} : { style }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
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
  Style: typeof ActionStyle;
}

export const Action: ActionComponent = Object.assign(ActionComponent, {
  CopyToClipboard,
  Push,
  SubmitForm,
  Style: ActionStyle,
});

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
  if (style === "success" || style === "SUCCESS") {
    return "success";
  }
  if (style === "failure" || style === "FAILURE") {
    return "failure";
  }
  if (style === "animated" || style === "ANIMATED") {
    return "animated";
  }
  return "neutral";
}

export interface ToastActionOptions {
  readonly title: string;
  readonly shortcut?: ShortcutLike;
  readonly onAction: (toast: Toast) => void;
}

export interface ToastOptions {
  readonly title: string;
  readonly message?: string;
  readonly style?: unknown;
  readonly primaryAction?: ToastActionOptions;
  readonly secondaryAction?: ToastActionOptions;
}

type ToastActionSlot = "primaryAction" | "secondaryAction";

interface RegisteredToastAction {
  readonly eventId: string;
  readonly callback: (toast: Toast) => void;
}

let toastCounter = 0;
let toastEventCounter = 0;

function normalizeToastAction(action: ToastActionOptions | undefined, where: string): ToastActionOptions | undefined {
  if (action === undefined) {
    return undefined;
  }
  if (typeof action !== "object" || action === null) {
    throw new CompatibilityError(`${where} must be an object`, { action });
  }
  if (typeof action.title !== "string" || action.title.length === 0) {
    throw new CompatibilityError(`${where} requires a non-empty title`, { action });
  }
  if (typeof action.onAction !== "function") {
    throw new CompatibilityError(`${where} onAction must be a function`, { action });
  }
  return action;
}

export class Toast {
  static readonly Style = {
    Success: "success",
    Failure: "failure",
    Animated: "animated",
  } as const;

  readonly #toastId = `toast-${++toastCounter}`;
  #title: string;
  #message: string | undefined;
  #style: ToastStyle;
  #primaryAction: ToastActionOptions | undefined;
  #secondaryAction: ToastActionOptions | undefined;
  #registeredActions = new Map<ToastActionSlot, RegisteredToastAction>();
  #shown = false;
  #sendQueue: Promise<void> = Promise.resolve();

  constructor(options: ToastOptions) {
    this.#title = options.title;
    this.#message = options.message;
    this.#style = normalizeToastStyle(options.style);
    this.#primaryAction = normalizeToastAction(options.primaryAction, "Toast.primaryAction");
    this.#secondaryAction = normalizeToastAction(options.secondaryAction, "Toast.secondaryAction");
  }

  get style(): ToastStyle {
    return this.#style;
  }

  set style(style: unknown) {
    this.#style = normalizeToastStyle(style);
    this.queueUpdate();
  }

  get title(): string {
    return this.#title;
  }

  set title(title: string) {
    this.#title = title;
    this.queueUpdate();
  }

  get message(): string | undefined {
    return this.#message;
  }

  set message(message: string | undefined) {
    this.#message = message;
    this.queueUpdate();
  }

  get primaryAction(): ToastActionOptions | undefined {
    return this.#primaryAction;
  }

  set primaryAction(action: ToastActionOptions | undefined) {
    this.#primaryAction = normalizeToastAction(action, "Toast.primaryAction");
    this.queueUpdate();
  }

  get secondaryAction(): ToastActionOptions | undefined {
    return this.#secondaryAction;
  }

  set secondaryAction(action: ToastActionOptions | undefined) {
    this.#secondaryAction = normalizeToastAction(action, "Toast.secondaryAction");
    this.queueUpdate();
  }

  async show(): Promise<void> {
    const operation: ToastOperation = this.#shown ? "update" : "show";
    await this.enqueue(operation);
    this.#shown = true;
  }

  async hide(): Promise<void> {
    if (!this.#shown) {
      return;
    }
    await this.enqueue("hide");
    this.#shown = false;
    this.clearActionEvents();
  }

  toPayload(): ToastPayload {
    return this.payloadFor(this.#shown ? "update" : "show");
  }

  private payloadFor(operation: ToastOperation): ToastPayload {
    if (operation === "hide") {
      return { toastId: this.#toastId, operation };
    }
    const primaryAction = this.serializeAction("primaryAction", this.#primaryAction);
    const secondaryAction = this.serializeAction("secondaryAction", this.#secondaryAction);
    return {
      toastId: this.#toastId,
      operation,
      title: this.#title,
      ...(this.#message === undefined ? {} : { message: this.#message }),
      style: this.#style,
      ...(primaryAction === undefined ? {} : { primaryAction }),
      ...(secondaryAction === undefined ? {} : { secondaryAction }),
    };
  }

  private serializeAction(
    slot: ToastActionSlot,
    action: ToastActionOptions | undefined,
  ): ToastActionPayload | undefined {
    if (action === undefined) {
      this.unregisterAction(slot);
      return undefined;
    }
    const normalized = normalizeToastAction(action, `Toast.${slot}`) as ToastActionOptions;
    const shortcut = serializeShortcut(normalized.shortcut, `Toast.${slot}`);
    const existing = this.#registeredActions.get(slot);
    if (existing !== undefined && existing.callback === normalized.onAction) {
      return {
        title: normalized.title,
        eventId: existing.eventId,
        ...(shortcut === undefined ? {} : { shortcut }),
      };
    }
    this.unregisterAction(slot);
    const eventId = `toast-event-${++toastEventCounter}`;
    compatGlobals.toastEvents?.set(eventId, () => normalized.onAction(this));
    this.#registeredActions.set(slot, { eventId, callback: normalized.onAction });
    return { title: normalized.title, eventId, ...(shortcut === undefined ? {} : { shortcut }) };
  }

  private unregisterAction(slot: ToastActionSlot): void {
    const existing = this.#registeredActions.get(slot);
    if (existing === undefined) {
      return;
    }
    compatGlobals.toastEvents?.delete(existing.eventId);
    this.#registeredActions.delete(slot);
  }

  private clearActionEvents(): void {
    this.unregisterAction("primaryAction");
    this.unregisterAction("secondaryAction");
  }

  private enqueue(operation: ToastOperation): Promise<void> {
    const payload = this.payloadFor(operation);
    const request = this.#sendQueue.then(() => requireContext().showToast(payload));
    this.#sendQueue = request.catch(() => undefined);
    return request;
  }

  private queueUpdate(): void {
    if (!this.#shown) {
      return;
    }
    void this.enqueue("update").catch(() => {});
  }
}

/**
 * Shows a toast in the client and returns the instance.
 */
export function showToast(options: ToastOptions): Promise<Toast>;
export function showToast(style: ToastStyle, title: string, message?: string): Promise<Toast>;
export function showToast(title: string): Promise<Toast>;
export function showToast(
  optionsOrStyle: ToastOptions | ToastStyle | string,
  title?: string,
  message?: string,
): Promise<Toast> {
  const toast =
    typeof optionsOrStyle === "string"
      ? title === undefined
        ? new Toast({ title: optionsOrStyle })
        : new Toast({
            title,
            style: optionsOrStyle,
            ...(message === undefined ? {} : { message }),
          })
      : new Toast(optionsOrStyle);
  return toast.show().then(() => toast);
}

export interface ShowHUDOptions {
  readonly clearRootSearch?: boolean;
  readonly popToRootType?: PopToRootType;
}

type CapabilityArguments = Readonly<Record<string, string | number | boolean>>;

async function callCapability(
  capability: string,
  operation: string,
  argumentsValue: CapabilityArguments | undefined,
  description: string,
): Promise<Awaited<ReturnType<RaycastCompatContext["requestCapability"]>>> {
  const response = await requireContext().requestCapability({
    capability,
    operation,
    ...(argumentsValue === undefined ? {} : { arguments: argumentsValue }),
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError(`${description} capability was not granted`, response);
  }
  return response;
}

/** Requests the client to display a transient heads-up message. */
export async function showHUD(title: string, options?: ShowHUDOptions): Promise<void> {
  const args: Record<string, string | number | boolean> = {
    title: requireNonEmptyString(title, "showHUD title"),
  };
  if (options !== undefined && options !== null) {
    if (!isRecord(options)) {
      unsupported("showHUD options", { options });
    }
    if (options.clearRootSearch !== undefined) {
      if (typeof options.clearRootSearch !== "boolean") {
        unsupported("showHUD clearRootSearch", { value: options.clearRootSearch });
      }
      args.clearRootSearch = options.clearRootSearch;
    }
    if (options.popToRootType !== undefined) {
      if (
        options.popToRootType !== PopToRootType.Default &&
        options.popToRootType !== PopToRootType.Immediate &&
        options.popToRootType !== PopToRootType.Suspended
      ) {
        unsupported("showHUD popToRootType", { value: options.popToRootType });
      }
      args.popToRootType = options.popToRootType;
    }
  }
  await callCapability("hud", "show", args, "The HUD show");
}

function serializeApplication(application: string | ApplicationLike, where: string): string {
  if (typeof application === "string") {
    return requireNonEmptyString(application, where);
  }
  if (!isRecord(application)) {
    unsupported(`${where} application`, { application });
  }
  for (const field of ["bundleId", "path", "windowsAppId", "name", "localizedName"]) {
    const value = application[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  unsupported(`${where} application`, { application });
}

/** Opens a URL, file, or application through the host capability boundary. */
export async function open(target: string, application?: string | ApplicationLike): Promise<void> {
  const args: Record<string, string | number | boolean> = {
    target: requireNonEmptyString(target, "open target"),
  };
  if (application !== undefined) {
    args.application = serializeApplication(application, "open");
  }
  await callCapability("open", "open", args, "The open");
}

function normalizeAlertAction(action: AlertActionOptions | undefined, where: string): AlertActionOptions | undefined {
  if (action === undefined || action === null) {
    return undefined;
  }
  if (!isRecord(action)) {
    unsupported(`${where} action`, { action });
  }
  const title = requireNonEmptyString(action.title, `${where} title`);
  let style: AlertActionStyleLike | undefined;
  if (action.style !== undefined) {
    if (action.style !== "default" && action.style !== "cancel" && action.style !== "destructive") {
      unsupported(`${where} style`, { value: action.style });
    }
    style = action.style;
  }
  let onAction: (() => void) | undefined;
  if (action.onAction !== undefined) {
    if (typeof action.onAction !== "function") {
      unsupported(`${where} onAction`, { value: action.onAction });
    }
    onAction = action.onAction as () => void;
  }
  return {
    title,
    ...(style === undefined ? {} : { style }),
    ...(onAction === undefined ? {} : { onAction }),
  };
}

/** Shows a confirmation dialog and invokes the selected action callback. */
export async function confirmAlert(options: AlertOptions): Promise<boolean> {
  if (!isRecord(options)) {
    unsupported("confirmAlert options", { options });
  }
  const title = requireNonEmptyString(options.title, "confirmAlert title");
  const icon = serializeIcon(options.icon, "confirmAlert");
  const primaryAction = normalizeAlertAction(options.primaryAction, "confirmAlert.primaryAction");
  const dismissAction = normalizeAlertAction(options.dismissAction, "confirmAlert.dismissAction");
  const args: Record<string, string | number | boolean> = { title };

  if (options.message !== undefined) {
    if (typeof options.message !== "string") {
      unsupported("confirmAlert message", { value: options.message });
    }
    args.message = options.message;
  }
  if (icon !== undefined) {
    args.icon = icon.icon;
    if (icon.iconTintColor !== undefined) {
      args.iconTintColor = icon.iconTintColor;
    }
  }
  if (options.rememberUserChoice !== undefined) {
    if (typeof options.rememberUserChoice !== "boolean") {
      unsupported("confirmAlert rememberUserChoice", { value: options.rememberUserChoice });
    }
    args.rememberUserChoice = options.rememberUserChoice;
  }
  if (primaryAction !== undefined) {
    args.primaryTitle = primaryAction.title;
    if (primaryAction.style !== undefined) {
      args.primaryStyle = primaryAction.style;
    }
  }
  if (dismissAction !== undefined) {
    args.dismissTitle = dismissAction.title;
    if (dismissAction.style !== undefined) {
      args.dismissStyle = dismissAction.style;
    }
  }

  const response = await callCapability("alert", "confirm", args, "The alert confirm");
  if (typeof response.value !== "boolean") {
    throw new CompatibilityError("The alert confirm capability returned a non-boolean result", response);
  }
  const confirmed = response.value;
  const selectedAction = confirmed ? primaryAction : dismissAction;
  selectedAction?.onAction?.();
  return confirmed;
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

/**
 * Synchronous LRU cache compatible with Raycast's command-facing API.
 *
 * V2 deliberately keeps this fallback in the extension process for now. The
 * namespace is shared by commands in the same extension/runtime realm, while
 * `storageDirectory` remains a stable compatibility value until a persistent
 * cache capability is added to the host contract.
 */
export class Cache {
  static get DEFAULT_CAPACITY(): number {
    return 10 * 1024 * 1024;
  }

  static get STORAGE_DIRECTORY_NAME(): string {
    return "cache";
  }

  readonly #state: CacheState;
  readonly #capacity: number;
  readonly #directory: string;

  constructor(options?: CacheOptions) {
    const context = requireContext();
    const namespace = options?.namespace === undefined || options.namespace === "" ? "default" : options.namespace;
    if (typeof namespace !== "string") {
      unsupported("Cache namespace", { namespace });
    }
    const capacity = options?.capacity ?? Cache.DEFAULT_CAPACITY;
    if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 0) {
      unsupported("Cache capacity", { capacity });
    }
    let directory: string;
    if (options?.directory !== undefined) {
      directory = requireNonEmptyString(options.directory, "Cache directory");
    } else {
      directory = `memory://blast-${Cache.STORAGE_DIRECTORY_NAME}/${encodeURIComponent(context.descriptor.extensionId)}/${encodeURIComponent(namespace)}`;
    }

    compatGlobals.cacheStores ??= new Map();
    const storeKey = `${context.descriptor.extensionId}\u0000${namespace}`;
    let state = compatGlobals.cacheStores.get(storeKey);
    if (state === undefined) {
      state = { storage: new Map(), subscribers: new Set() };
      compatGlobals.cacheStores.set(storeKey, state);
    }
    this.#state = state;
    this.#capacity = capacity;
    this.#directory = directory;
  }

  get storageDirectory(): string {
    return this.#directory;
  }

  get(key: string): string | undefined {
    this.assertKey(key);
    if (!this.#state.storage.has(key)) {
      return undefined;
    }
    const value = this.#state.storage.get(key);
    this.#state.storage.delete(key);
    this.#state.storage.set(key, value as string);
    return value;
  }

  has(key: string): boolean {
    this.assertKey(key);
    return this.#state.storage.has(key);
  }

  get isEmpty(): boolean {
    return this.#state.storage.size === 0;
  }

  set(key: string, data: string): void {
    this.assertKey(key);
    if (typeof data !== "string") {
      unsupported("Cache data", { data });
    }
    this.#state.storage.delete(key);
    this.#state.storage.set(key, data);
    this.maintainCapacity();
    this.notifySubscribers(key, data);
  }

  remove(key: string): boolean {
    this.assertKey(key);
    if (!this.#state.storage.delete(key)) {
      return false;
    }
    this.notifySubscribers(key, undefined);
    return true;
  }

  clear(options?: { readonly notifySubscribers?: boolean }): void {
    this.#state.storage.clear();
    if (options?.notifySubscribers !== false) {
      this.notifySubscribers(undefined, undefined);
    }
  }

  subscribe(subscriber: CacheSubscriber): CacheSubscription {
    if (typeof subscriber !== "function") {
      unsupported("Cache subscriber", { subscriber });
    }
    this.#state.subscribers.add(subscriber);
    return () => {
      this.#state.subscribers.delete(subscriber);
    };
  }

  private assertKey(key: string): void {
    if (typeof key !== "string") {
      unsupported("Cache key", { key });
    }
  }

  private maintainCapacity(): void {
    let totalSize = 0;
    for (const data of this.#state.storage.values()) {
      totalSize += cacheByteLength(data);
    }
    while (totalSize > this.#capacity && this.#state.storage.size > 0) {
      const oldest = this.#state.storage.entries().next().value as [string, string];
      this.#state.storage.delete(oldest[0]);
      totalSize -= cacheByteLength(oldest[1]);
      this.notifySubscribers(oldest[0], undefined);
    }
  }

  private notifySubscribers(key: string | undefined, data: string | undefined): void {
    for (const subscriber of [...this.#state.subscribers]) {
      subscriber(key, data);
    }
  }
}

function cacheByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
