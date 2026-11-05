// @ts-nocheck

import { render } from "./render.js";
const root = document.querySelector("#app");
if (!root) throw new Error("Missing app root");
const token = new URLSearchParams(location.search).get("t");
/** @type {import("@blastlauncher/client-core").ControllerView | undefined} */
let view;
/** @param {import("@blastlauncher/client-core").ControllerInput} input */
const send = (input) =>
  fetch("/input?t=" + encodeURIComponent(token ?? ""), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
/** @param {import("@blastlauncher/client-core").ControllerView} next */
const draw = (next) => {
  view = next;
  root.innerHTML = render(view);
};
new EventSource("/events?t=" + encodeURIComponent(token ?? "")).addEventListener(
  "message",
  (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "view") draw(message.view);
    if (message.type === "effect") {
      if (message.name === "clipboard.copy")
        navigator.clipboard?.writeText(message.params?.text ?? "");
      if (message.name === "open.url") window.open(message.params?.url, "_blank", "noopener");
    }
  },
);
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") send({ type: "move", direction: "down" });
  else if (event.key === "ArrowUp") send({ type: "move", direction: "up" });
  else if (event.key === "Enter") send({ type: "primary" });
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
    send({ type: "openActions" });
  else if (event.key === "Escape") send({ type: "back" });
});
document.addEventListener("input", (event) => {
  const target = /** @type {HTMLInputElement} */ (event.target);
  if (target.id === "search") send({ type: "search", text: target.value });
  else if (target.id === "action-search") send({ type: "actionsQuery", text: target.value });
  else if (target.dataset.field)
    send({ type: "setValue", id: target.dataset.field, value: target.value });
});
document.addEventListener("click", (event) => {
  const target = /** @type {Element} */ (event.target);
  const row = target.closest("[data-action-index]");
  if (row && view?.actions.open) {
    const index = Number(row.getAttribute("data-action-index"));
    const delta = index - view.actions.selectedIndex;
    for (let i = 0; i < Math.abs(delta); i++)
      send({ type: "move", direction: delta > 0 ? "down" : "up" });
    return;
  }
  const item = target.closest("[data-id]");
  if (item) send({ type: "select", id: item.getAttribute("data-id") ?? "" });
});
