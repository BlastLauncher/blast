import type { ControllerInput, ControllerView } from "@blastlauncher/client-core";
import { defaultStyles } from "./default-styles.ts";
import { render } from "./render.js";

export type WebStatus = { text: string; error?: boolean; progress?: boolean };
export type WebView =
  | ControllerView
  | { type: "loading"; extension?: string; command?: string }
  | { type: "error"; message: string };
export type ViewInput = (input: ControllerInput) => void;
export type Theme = string | Record<string, string>;

const STYLE_ID = "blast-web-styles";

function installStyles(root: Document) {
  if (root.getElementById(STYLE_ID)) return;
  const style = root.createElement("style");
  style.id = STYLE_ID;
  style.textContent = defaultStyles;
  root.head.prepend(style);
}

const field = (target: EventTarget | null) =>
  target instanceof HTMLElement ? target.closest<HTMLElement>("[data-field]") : null;

/**
 * Draws views with the shared HTML renderer and turns clicks, typing and keys
 * into controller input. Everything is scoped to `element`.
 */
export function createDefaultRenderer(
  element: HTMLElement,
  send: ViewInput,
  options: { theme?: Theme; actionsKey?: string } = {},
) {
  installStyles(element.ownerDocument);
  element.classList.add("blast-web");
  if (typeof options.theme === "string") element.dataset.theme = options.theme;
  else if (options.theme)
    for (const [key, value] of Object.entries(options.theme)) element.style.setProperty(key, value);
  if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
  let view: ControllerView | undefined;

  const onKeydown = (event: KeyboardEvent) => {
    if (!view) return;
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLTextAreaElement;
    if (event.key === "ArrowDown") send({ type: "move", direction: "down" });
    else if (event.key === "ArrowUp") send({ type: "move", direction: "up" });
    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
      send(view.kind === "form" ? { type: "submit" } : { type: "primary" });
    else if (event.key === "Enter" && !typing && !(target instanceof HTMLButtonElement))
      send(view.kind === "form" ? { type: "submit" } : { type: "primary" });
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
      send({ type: view.actions.open ? "closeActions" : "openActions" });
    else if (event.key === "Escape") {
      if (!view.actions.open && !view.dropdown?.open && view.search.text)
        send({ type: "search", text: "" });
      else send({ type: "back" });
    } else return;
    event.preventDefault();
  };
  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const formField = field(target);
    if (target.id === "search") send({ type: "search", text: target.value });
    else if (target.id === "action-search") send({ type: "actionsQuery", text: target.value });
    else if (target.hasAttribute("data-dropdown-search"))
      send({ type: "dropdownQuery", text: target.value });
    else if (formField?.dataset.field)
      send(
        target.type === "checkbox"
          ? { type: "toggle", id: formField.dataset.field }
          : { type: "setValue", id: formField.dataset.field, value: target.value },
      );
  };
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const footer = target.closest<HTMLElement>("[data-footer]")?.dataset.footer;
    if (footer === "primary") return send({ type: "primary" });
    if (footer === "actions") return send({ type: "openActions" });
    if (footer === "back") return send({ type: "back" });
    if (target.closest("[data-dropdown-open]")) return send({ type: "openDropdown" });
    const action = target.closest<HTMLElement>("[data-action-index]");
    if (action && view?.actions.open) {
      const delta = Number(action.dataset.actionIndex) - view.actions.selectedIndex;
      for (let step = 0; step < Math.abs(delta); step++)
        send({ type: "move", direction: delta > 0 ? "down" : "up" });
      return send({ type: "primary" });
    }
    const item = target.closest<HTMLElement>("[data-id], [data-menu-id]");
    if (item) send({ type: "select", id: item.dataset.id ?? item.dataset.menuId ?? "" });
  };
  const onSubmit = (event: Event) => {
    event.preventDefault();
    send({ type: "submit" });
  };
  element.addEventListener("keydown", onKeydown);
  element.addEventListener("input", onInput);
  element.addEventListener("click", onClick);
  element.addEventListener("submit", onSubmit);

  /** Redrawing replaces the DOM, so put the caret back where the visitor left it. */
  const withFocus = (draw: () => void) => {
    const active = element.contains(document.activeElement)
      ? (document.activeElement as HTMLInputElement)
      : undefined;
    const key = active?.id || active?.dataset.field;
    const selection = active ? [active.selectionStart, active.selectionEnd] : undefined;
    draw();
    const next =
      (key
        ? element.querySelector<HTMLInputElement>(`#${CSS.escape(key)}, [data-field="${key}"]`)
        : null) ?? (active ? null : element.querySelector<HTMLInputElement>("#search"));
    if (!next) return;
    next.focus({ preventScroll: true });
    if (selection?.[0] != null && selection[1] != null)
      next.setSelectionRange?.(selection[0], selection[1]);
  };

  return {
    draw(next: WebView, status: WebStatus) {
      if ("type" in next && next.type === "loading") {
        view = undefined;
        element.innerHTML = `<p role="status" aria-busy="true"></p>`;
        element.firstElementChild!.textContent = status.text || "Loading extension…";
        return;
      }
      if ("type" in next && next.type === "error") {
        view = undefined;
        element.innerHTML = `<p role="alert" data-blast-error></p>`;
        element.firstElementChild!.textContent = next.message;
        return;
      }
      view = next as ControllerView;
      withFocus(() => {
        element.innerHTML = render(view!, {
          status,
          ...(options.actionsKey ? { actionsKey: options.actionsKey } : {}),
        });
      });
    },
    destroy() {
      element.removeEventListener("keydown", onKeydown);
      element.removeEventListener("input", onInput);
      element.removeEventListener("click", onClick);
      element.removeEventListener("submit", onSubmit);
      element.classList.remove("blast-web");
      element.replaceChildren();
    },
  };
}
