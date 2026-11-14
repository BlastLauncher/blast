import { startSession, type WebMount, type WebMountOptions } from "./session.ts";

export * from "./browser-install.ts";
export * from "./browser-bundle.ts";
export { bundleKey, bundleMatches, parseBundleIndex, sha256Hex } from "./bundles.ts";
export { createDefaultHandlers } from "./handlers.ts";
export { defineBlastExtension } from "./custom-element.ts";
export { prewarm } from "./sandbox.ts";
export type {
  WebExit,
  WebFrame,
  WebHandlers,
  WebMount,
  WebMountOptions,
  WebPreferenceRequest,
  WebStatus,
  WebView,
} from "./session.ts";

/**
 * Runs a Raycast extension inside `element` (or hands its views to
 * `options.render`). The extension executes in the cross-origin sandbox at
 * `options.sandboxUrl`; it never touches the embedding page.
 */
export function mount(element: HTMLElement, options: WebMountOptions): WebMount {
  if (!element) throw new TypeError("mount requires an element");
  return startSession(element, options);
}
