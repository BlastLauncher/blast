import { createElement, type ReactNode } from "react";
import { Action } from "./action.ts";
import type { ImageLike, Shortcut } from "./types.ts";

export interface ActionPanelProps {
  /** Sections or Actions. */
  children?: ReactNode;
  /** The title displayed at the top of the panel. */
  title?: string;
}

export interface ActionPanelSectionProps {
  /** Actions of the section. */
  children?: ReactNode;
  /** Title displayed above the section. */
  title?: string;
}

/** `SubmenuProps` from the declarations (`ActionPanel.Submenu`). */
export interface ActionPanelSubmenuProps {
  /** The title displayed for the submenu. */
  title: string;
  /** The icon displayed for the submenu. */
  icon?: ImageLike;
  /** The keyboard shortcut for the submenu. */
  shortcut?: Shortcut;
  /** Items of the submenu: actions and sections. */
  children?: ReactNode;
  /** Callback that is triggered when the submenu is opened. */
  onOpen?: () => void;
  /**
   * Indicates whether the submenu should be focused automatically when its
   * parent ActionPanel (or submenu) opens.
   */
  autoFocus?: boolean;
  /**
   * Toggles filtering of the submenu's search bar; `false` (or a
   * `keepSectionOrder` object) hands filtering to the extension.
   */
  filtering?: boolean | { keepSectionOrder: boolean };
  /** Indicates whether a loading indicator should be shown. */
  isLoading?: boolean;
  /** Throttles `onSearchTextChange` events. */
  throttle?: boolean;
  /** Callback triggered when the submenu's search bar text changes. */
  onSearchTextChange?: (text: string) => void;
}

function ActionPanelSection(props: ActionPanelSectionProps) {
  return createElement("ActionPanel.Section", props);
}

// `onOpen` and `onSearchTextChange` serialize as handler references, so
// clients can dispatch a submenu opening (the CLI's `submenu <title>` script
// command) and search text through the scene.
function Submenu(props: ActionPanelSubmenuProps) {
  return createElement("ActionPanel.Submenu", props);
}

export const ActionPanel = Object.assign(
  function ActionPanel(props: ActionPanelProps) {
    return createElement("ActionPanel", props);
  },
  // `ActionPanel.Item` is the deprecated name of `Action` (`typeof Action`).
  { Section: ActionPanelSection, Submenu, Item: Action },
);

/** Deprecated top-level alias of `Action`. */
export const ActionPanelItem = Action;

/** Deprecated top-level alias of `ActionPanel.Submenu`. */
export const ActionPanelSubmenu = Submenu;
