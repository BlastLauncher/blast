import { createRootController, type RootCommand } from "../../client-core/src/index.ts";
import type { ControllerView } from "../../client-core/src/index.ts";

export * from "./browser-install.ts";
export * from "./browser-bundle.ts";

export type WebHandlers = {
  storage?: Storage;
  clipboard?: { readText?: () => Promise<string>; writeText?: (text: string) => Promise<void> };
  openUrl?: (url: string) => void;
};
export type WebInput = unknown;
export type WebView = ControllerView | { type: "loading"; extension?: string; command?: string };
export type WebMountOptions = {
  extension?: string;
  source?: string;
  command?: string;
  sandboxUrl: string;
  root?: boolean;
  handlers?: WebHandlers;
  render?: (view: WebView, input: (value: WebInput) => void) => void;
  theme?: string | Record<string, string>;
};
export type WebMount = { close(): void; input(value?: WebInput): void };

const defaultRender = (element: HTMLElement, theme?: WebMountOptions["theme"]) => {
  if (typeof theme === "string") element.dataset.theme = theme;
  if (theme && typeof theme === "object")
    for (const [key, value] of Object.entries(theme)) element.style.setProperty(key, value);
  return (view: WebView) => {
    element.replaceChildren();
    const loading = "type" in view && view.type === "loading";
    if (loading) {
      const status = document.createElement("p");
      status.textContent = "Loading extension…";
      status.setAttribute("role", "status");
      element.append(status);
      return;
    }
    const pre = document.createElement("pre");
    pre.dataset.blastView = "true";
    pre.textContent = JSON.stringify(view, null, 2);
    element.append(pre);
  };
};

/** Mounts a Blast browser session without importing the Node host package. */
export function mount(element: HTMLElement, options: WebMountOptions): WebMount {
  if (!element) throw new TypeError("mount requires an element");
  if (!options.sandboxUrl) throw new TypeError("mount requires sandboxUrl");
  let closed = false;
  const draw = options.render
    ? (view: WebView) => options.render!(view, input)
    : defaultRender(element, options.theme);
  const input = (_value?: WebInput) => {
    if (closed) return;
    // Custom renderers receive input through their callback; the sandbox port is
    // installed by the runtime handshake when an extension is connected.
  };
  const root = options.root ? createRootController([]) : undefined;
  if (root) {
    const commands: RootCommand[] = [];
    root.setCatalog(commands);
    draw(root.view() as WebView);
  } else {
    const loading: { type: "loading"; extension?: string; command?: string } = { type: "loading" };
    const extension = options.extension ?? options.source;
    if (extension) loading.extension = extension;
    if (options.command) loading.command = options.command;
    draw(loading);
  }
  const iframe = document.createElement("iframe");
  iframe.src = options.sandboxUrl;
  iframe.hidden = true;
  iframe.setAttribute("aria-hidden", "true");
  element.append(iframe);
  return {
    input,
    close() {
      if (closed) return;
      closed = true;
      iframe.remove();
      element.replaceChildren();
    },
  };
}

export const createDefaultHandlers = (): WebHandlers => ({
  ...(typeof localStorage === "undefined" ? {} : { storage: localStorage }),
  clipboard: {
    readText: () => (navigator as Navigator & { clipboard: Clipboard }).clipboard.readText(),
    writeText: (text) =>
      (navigator as Navigator & { clipboard: Clipboard }).clipboard.writeText(text),
  },
  openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer"),
});
