import { startSession, type WebMount, type WebMountOptions } from "./session.ts";

export * from "./browser-install.ts";
export * from "./browser-bundle.ts";
export { createDefaultHandlers } from "./handlers.ts";
export { defineBlastExtension } from "./custom-element.ts";
export type { WebHandlers, WebMount, WebMountOptions, WebStatus, WebView } from "./session.ts";

/**
 * Runs a Raycast extension inside `element` (or hands its views to
 * `options.render`). The extension executes in the cross-origin sandbox at
 * `options.sandboxUrl`; it never touches the embedding page.
 */
export function mount(element: HTMLElement, options: WebMountOptions): WebMount {
  if (!element) throw new TypeError("mount requires an element");
  return startSession(element, options);
}
