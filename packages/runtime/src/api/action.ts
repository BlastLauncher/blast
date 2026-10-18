import { createElement, type ReactNode } from "react";
import { copy, toText, type ClipboardContent } from "./clipboard.ts";
import { requestCapability } from "./capability.ts";
import { useNavigation } from "./navigation.ts";
import { SubmitForm } from "./form.ts";
import { Icon } from "./enums.generated.ts";
import type { ImageLike, Shortcut } from "./types.ts";

/**
 * Mirrors the declarations' `ActionStyle` enum. It lives here rather than in
 * `enums.generated.ts` because the inventory only tracks the `Action.Style`
 * path (the enum is not an exported top-level symbol), so the generator cannot
 * name its members.
 */
export const ActionStyle = {
  Regular: "regular",
  Destructive: "destructive",
} as const;
export type ActionStyle = (typeof ActionStyle)[keyof typeof ActionStyle];

export interface ActionProps {
  /** The title displayed for the Action. */
  title: string;
  /** The icon displayed for the Action. */
  icon?: ImageLike;
  /** Defines the visual style of the Action. */
  style?: ActionStyle;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /**
   * Indicates whether the Action should be focused automatically when its
   * ActionPanel opens.
   */
  autoFocus?: boolean;
  /** Callback that is triggered when the Action is selected. */
  onAction?: () => void;
}

export interface CopyToClipboardProps {
  /** The contents that will be copied to the clipboard. */
  content: string | number | ClipboardContent;
  /** An optional title for the Action. @defaultValue `"Copy to Clipboard"` */
  title?: string;
  /** An optional icon displayed for the Action. */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Indicates whether the content should be treated as confidential. */
  concealed?: boolean;
  /** Callback when the content was copied to clipboard. */
  onCopy?: (content: string | number | ClipboardContent) => void;
}

export const Action = Object.assign(
  function Action(props: ActionProps) {
    return createElement("Action", props);
  },
  { CopyToClipboard, OpenInBrowser, Paste, Push, SubmitForm, Style: ActionStyle },
);

export function CopyToClipboard(props: CopyToClipboardProps) {
  const { content, onCopy, title, ...rest } = props;
  // `content` stays in the runtime: clipboard payloads (possibly concealed
  // secrets) must not be broadcast to clients in the scene.
  return createElement("Action.CopyToClipboard", {
    ...rest,
    title: title ?? "Copy to Clipboard",
    onAction: () => copy(content).then(() => onCopy?.(content)),
  });
}

export interface OpenInBrowserProps {
  url: string;
  title?: string;
  icon?: ImageLike;
  shortcut?: Shortcut;
  onOpen?: (url: string) => void;
}

export interface PasteProps {
  content: string | number | ClipboardContent;
  title?: string;
  icon?: ImageLike;
  shortcut?: Shortcut;
  onPaste?: (content: string | number | ClipboardContent) => void;
}

export function OpenInBrowser(props: OpenInBrowserProps) {
  const { url, onOpen, title, icon, ...rest } = props;
  return createElement("Action.OpenInBrowser", {
    ...rest,
    title: title ?? "Open in Browser",
    icon: icon ?? Icon.Globe,
    onAction: async () => {
      await requestCapability("open.url", { url });
      onOpen?.(url);
    },
  });
}

export function Paste(props: PasteProps) {
  const { content, onPaste, title, icon, ...rest } = props;
  return createElement("Action.Paste", {
    ...rest,
    title: title ?? "Paste in Active App",
    icon: icon ?? Icon.Clipboard,
    onAction: async () => {
      await requestCapability("clipboard.paste", { text: toText(content, "Action.Paste") });
      onPaste?.(content);
    },
  });
}

export { CopyToClipboard as CopyToClipboardAction, Paste as PasteAction };

export interface PushProps {
  title: string;
  target: ReactNode;
  icon?: ImageLike;
  shortcut?: Shortcut;
  onPush?: () => void;
  onPop?: () => void;
}

export function Push({ target, onPush, onPop, ...props }: PushProps) {
  const { push } = useNavigation();
  return createElement("Action.Push", {
    ...props,
    onAction: () => {
      push(target, onPop);
      onPush?.();
    },
  });
}

export { Push as PushAction };
