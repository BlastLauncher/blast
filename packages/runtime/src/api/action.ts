import { createElement } from "react";
import { copy, type ClipboardContent } from "./clipboard.ts";
import type { ImageLike, Shortcut } from "./types.ts";

export interface ActionProps {
  /** The title displayed for the Action. */
  title: string;
  /** The icon displayed for the Action. */
  icon?: ImageLike;
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

export function Action(props: ActionProps) {
  return createElement("Action", props);
}

export function CopyToClipboard(props: CopyToClipboardProps) {
  const { content, onCopy, title, ...rest } = props;
  return createElement("Action.CopyToClipboard", {
    content,
    ...rest,
    title: title ?? "Copy to Clipboard",
    onAction: () => copy(content).then(() => onCopy?.(content)),
  });
}
