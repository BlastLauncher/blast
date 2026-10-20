import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { text } from "./nodes.ts";
import { HUD_DURATION_MS } from "./hud.ts";

// Toast, HUD and Alert as data. The runtime publishes them as children of the
// root Navigation node; this says what is visible and which effects the HUD
// and alert request, so every embedder renders them the same way.

export type ToastAction = { node: SceneNode; name: string; title: string; shortcut: unknown };
export type ToastState = {
  node: SceneNode;
  /** `animated`, `success` or `failure`, as the runtime sent it. */
  style: string;
  title: string;
  message: string;
  actions: ToastAction[];
};
export type PopToRootType = "default" | "immediate" | "suspended";
export type HudState = {
  node: SceneNode;
  title: string;
  /** How long the HUD stays up before the client hides it. */
  durationMs: number;
  /** Raycast's default respects the user's "Pop to Root Search" preference. */
  popToRootType: PopToRootType;
  clearRootSearch: boolean;
};
export type AlertAction = { node: SceneNode; title: string; style: string };
export type AlertState = {
  node: SceneNode;
  title: string;
  message: string;
  /** The client persists the answer and stops asking when set. */
  rememberUserChoice: boolean;
  /** Confirms (Enter). */
  primary: AlertAction | undefined;
  /** Dismisses (Esc). */
  dismiss: AlertAction | undefined;
};
export type FeedbackState = {
  toast: ToastState | undefined;
  hud: HudState | undefined;
  alert: AlertState | undefined;
};

export function feedbackNodes(scene: SceneMessage | undefined): SceneNode[] {
  return scene?.root?.type === "Navigation" ? scene.root.children : [];
}

function popToRootType(value: unknown): PopToRootType {
  return value === "immediate" || value === "suspended" ? value : "default";
}

export function feedbackState(scene: SceneMessage | undefined): FeedbackState {
  const nodes = feedbackNodes(scene);
  const toast = nodes.find((node) => node.type === "Toast");
  const hud = nodes.find((node) => node.type === "HUD");
  const alert = nodes.find((node) => node.type === "Alert");
  const alertAction = (name: string): AlertAction | undefined => {
    const node = alert?.children.find((child) => child.props.name === name);
    return node
      ? { node, title: text(node.props.title), style: text(node.props.style) || "default" }
      : undefined;
  };
  return {
    toast: toast && {
      node: toast,
      style: text(toast.props.style),
      title: text(toast.props.title),
      message: text(toast.props.message),
      actions: toast.children.map((node) => ({
        node,
        name: text(node.props.name),
        title: text(node.props.title),
        shortcut: node.props.shortcut,
      })),
    },
    hud: hud && {
      node: hud,
      title: text(hud.props.title),
      durationMs: HUD_DURATION_MS,
      popToRootType: popToRootType(hud.props.popToRootType),
      clearRootSearch: hud.props.clearRootSearch === true,
    },
    alert: alert && {
      node: alert,
      title: text(alert.props.title),
      message: text(alert.props.message),
      rememberUserChoice: alert.props.rememberUserChoice === true,
      primary: alertAction("primaryAction"),
      dismiss: alertAction("dismissAction"),
    },
  };
}
