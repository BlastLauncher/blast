import { startSession, type WebMount, type WebMountOptions } from "./session.ts";

/**
 * Defines `<blast-extension extension="raycast/extensions/name" sandbox-url="…">`
 * for pages that prefer declarative embedding. Optional attributes: `source`,
 * `command`, `assets-url`, `theme`, and the booleans `root` and `fixtures`.
 */
export function defineBlastExtension(tag = "blast-extension"): void {
  if (customElements.get(tag)) return;
  customElements.define(
    tag,
    class extends HTMLElement {
      #session: WebMount | undefined;
      connectedCallback() {
        const options: WebMountOptions = {
          sandboxUrl: this.getAttribute("sandbox-url") ?? "/sandbox/",
          root: this.hasAttribute("root"),
          fixtures: this.hasAttribute("fixtures"),
        };
        for (const [attribute, key] of [
          ["extension", "extension"],
          ["source", "source"],
          ["command", "command"],
          ["assets-url", "assetsUrl"],
          ["theme", "theme"],
        ] as const) {
          const value = this.getAttribute(attribute);
          if (value) options[key] = value;
        }
        this.#session = startSession(this, options);
      }
      disconnectedCallback() {
        this.#session?.close();
        this.#session = undefined;
      }
    },
  );
}
