import { mount, type WebMount, type WebMountOptions } from "./index.ts";

/** Defines <blast-extension> for pages that prefer declarative embedding. */
export function defineBlastExtension(tag = "blast-extension"): void {
  if (customElements.get(tag)) return;
  customElements.define(
    tag,
    class extends HTMLElement {
      #session: WebMount | undefined;
      connectedCallback() {
        const extension = this.getAttribute("extension") ?? undefined;
        const source = this.getAttribute("source") ?? undefined;
        const command = this.getAttribute("command") ?? undefined;
        const sandboxUrl = this.getAttribute("sandbox-url") ?? "/sandbox/";
        const options: WebMountOptions = { sandboxUrl };
        if (extension) options.extension = extension;
        if (source) options.source = source;
        if (command) options.command = command;
        this.#session = mount(this, options);
      }
      disconnectedCallback() {
        this.#session?.close();
        this.#session = undefined;
      }
    },
  );
}

export type { WebMountOptions };
