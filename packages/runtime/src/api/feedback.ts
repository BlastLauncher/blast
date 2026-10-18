import { createElement as h, useLayoutEffect, useSyncExternalStore } from "react";
// `AlertActionStyle_2` and `ToastStyle_2` are the declarations' names behind the
// public `Alert.ActionStyle` and `Toast.Style` paths (api-extractor dedupes
// alias collisions with a numeric suffix).
import { AlertActionStyle_2, ToastStyle_2 } from "./enums.generated.ts";
import type { ImageLike, Shortcut } from "./types.ts";
import type { PopToRootTypeValue } from "./window.ts";

export interface ToastActionOptions {
  title: string;
  shortcut?: Shortcut;
  onAction(toast: Toast): void;
}
export interface ToastOptions {
  title: string;
  message?: string | undefined;
  style?: string;
  primaryAction?: ToastActionOptions | undefined;
  secondaryAction?: ToastActionOptions | undefined;
}
export interface AlertActionOptions {
  title: string;
  style?: string;
  onAction?(): void;
}
export interface AlertOptions {
  title: string;
  message?: string | undefined;
  icon?: ImageLike;
  primaryAction?: AlertActionOptions;
  dismissAction?: AlertActionOptions;
  rememberUserChoice?: boolean;
}
export interface HUDOptions {
  clearRootSearch?: boolean;
  popToRootType?: PopToRootTypeValue;
}

export const Alert = { ActionStyle: AlertActionStyle_2 } as const;
export const AlertActionStyle = Alert.ActionStyle;

const activeToast: { current: Toast | undefined } = { current: undefined };
let hud: ({ title: string } & HUDOptions) | undefined;
let revision = 0;
const listeners = new Set<() => void>();
const committed = new Map<number, () => void>();
let nextAlert = 0;
const alerts: { id: number; options: AlertOptions; resolve(value: boolean): void }[] = [];
let mount: (() => void) | undefined;

// No-view commands mount a scene lazily, retaining their scene-free fast path.
export function setFeedbackMount(callback: () => void) {
  mount = callback;
}
/**
 * Mounts that lazily created scene, if the command has one. Feedback state and
 * the window's `closeMainWindow` request both publish through it.
 */
export function mountScene(): void {
  mount?.();
}
function changed(wait = false): Promise<void> {
  revision++;
  const result = wait
    ? new Promise<void>((resolve) => committed.set(revision, resolve))
    : Promise.resolve();
  for (const listener of listeners) listener();
  mountScene();
  return result;
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      activeToast.current = undefined;
      hud = undefined;
      for (const alert of alerts.splice(0)) alert.resolve(false);
      for (const resolve of committed.values()) resolve();
      committed.clear();
      revision++;
    }
  };
};
const snapshot = () => revision;

export class Toast {
  static Style = ToastStyle_2;
  private options: ToastOptions;
  constructor(props: ToastOptions) {
    this.options = { ...props, style: props.style ?? Toast.Style.Success };
  }
  get title() {
    return this.options.title;
  }
  set title(value: string) {
    this.options.title = value;
    this.update();
  }
  get message() {
    return this.options.message;
  }
  set message(value: string | undefined) {
    this.options.message = value;
    this.update();
  }
  get style() {
    return this.options.style!;
  }
  set style(value: string) {
    this.options.style = value;
    this.update();
  }
  get primaryAction() {
    return this.options.primaryAction;
  }
  set primaryAction(value: ToastActionOptions | undefined) {
    this.options.primaryAction = value;
    this.update();
  }
  get secondaryAction() {
    return this.options.secondaryAction;
  }
  set secondaryAction(value: ToastActionOptions | undefined) {
    this.options.secondaryAction = value;
    this.update();
  }
  show(): Promise<void> {
    activeToast.current = this;
    return changed(true);
  }
  hide(): Promise<void> {
    if (activeToast.current !== this) return Promise.resolve();
    activeToast.current = undefined;
    return changed(true);
  }
  private update() {
    if (activeToast.current === this) void changed();
  }
}
export const ToastStyle = Toast.Style;

export function showToast(options: ToastOptions): Promise<Toast>;
export function showToast(style: string, title: string, message?: string): Promise<Toast>;
export async function showToast(options: ToastOptions | string, title?: string, message?: string) {
  const next = new Toast(
    typeof options === "string" ? { style: options, title: title!, message } : options,
  );
  await next.show();
  return next;
}
export function showHUD(title: string, options: HUDOptions = {}): Promise<void> {
  hud = { title, ...options };
  return changed(true);
}
export function confirmAlert(options: AlertOptions): Promise<boolean> {
  return new Promise((resolve) => {
    alerts.push({ id: ++nextAlert, options, resolve });
    void changed();
  });
}

export function FeedbackScene() {
  const version = useSyncExternalStore(subscribe, snapshot, snapshot);
  useLayoutEffect(() => {
    for (const [pending, resolve] of committed) {
      if (pending <= version) {
        committed.delete(pending);
        resolve();
      }
    }
  }, [version]);
  const currentToast = activeToast.current;
  const alert = alerts[0];
  const respond = (answer: boolean) => {
    // Stale or repeated events must not answer the next queued alert.
    if (alerts[0] !== alert || !alert) return;
    alerts.shift();
    void changed();
    alert.resolve(answer);
    return (answer ? alert.options.primaryAction : alert.options.dismissAction)?.onAction?.();
  };
  const toastAction = (action: ToastActionOptions | undefined, name: string) =>
    action &&
    h("Toast.Action", {
      key: name,
      name,
      title: action.title,
      shortcut: action.shortcut,
      onAction: () => action.onAction(currentToast!),
    });
  return [
    currentToast &&
      h(
        "Toast",
        {
          key: "toast",
          title: currentToast.title,
          message: currentToast.message,
          style: currentToast.style,
        },
        toastAction(currentToast.primaryAction, "primaryAction"),
        toastAction(currentToast.secondaryAction, "secondaryAction"),
      ),
    hud && h("HUD", { key: "hud", ...hud }),
    alert &&
      h(
        "Alert",
        {
          key: alert.id,
          title: alert.options.title,
          message: alert.options.message,
          icon: alert.options.icon,
          rememberUserChoice: alert.options.rememberUserChoice,
        },
        h("Alert.Action", {
          name: "primaryAction",
          title: alert.options.primaryAction?.title ?? "OK",
          style: alert.options.primaryAction?.style ?? Alert.ActionStyle.Default,
          onAction: () => respond(true),
        }),
        h("Alert.Action", {
          name: "dismissAction",
          title: alert.options.dismissAction?.title ?? "Cancel",
          style: alert.options.dismissAction?.style ?? Alert.ActionStyle.Cancel,
          onAction: () => respond(false),
        }),
      ),
  ];
}
