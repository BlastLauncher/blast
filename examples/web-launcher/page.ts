import type { ControllerView } from "@blastlauncher/client-core";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const button = (label: string, action: string, selected = false) =>
  `<button data-input="${escapeHtml(action)}"${selected ? ' class="selected"' : ""}>${escapeHtml(label)}</button>`;

export function render(view: ControllerView): string {
  const search = `<input id="search" value="${escapeHtml(view.search.text)}" placeholder="${escapeHtml(view.search.placeholder)}" aria-label="Search">`;
  const rows = view.rows
    .map(
      (row) =>
        `<li${row.selected ? ' class="selected"' : ""} data-id="${escapeHtml(row.id)}">${escapeHtml(row.text)}</li>`,
    )
    .join("");
  const actions = view.actions.open
    ? `<section class="actions"><strong>${escapeHtml(view.actions.title)}</strong>${view.actions.breadcrumb.map(escapeHtml).join(" / ")}<input value="${escapeHtml(view.actions.query)}" aria-label="Action search"><ul>${view.actions.rows.map((row) => `<li${row.selected ? ' class="selected"' : ""}>${escapeHtml(row.title)} <small>${escapeHtml(row.shortcut)}</small></li>`).join("")}</ul></section>`
    : "";
  const form = view.form
    ? `<form>${view.form.fields.map((field) => `<label>${escapeHtml(field.title || field.label)}<input data-field="${escapeHtml(field.id)}" value="${escapeHtml(field.text)}" placeholder="${escapeHtml(field.placeholder)}"${field.focused ? " autofocus" : ""}></label>`).join("")}${button("Submit", "primary")}</form>`
    : "";
  const detail =
    view.kind === "detail" ? `<article class="detail">${escapeHtml(view.detail)}</article>` : "";
  const toast = view.feedback.toast
    ? `<aside class="toast" data-style="${escapeHtml(view.feedback.toast.style)}"><strong>${escapeHtml(view.feedback.toast.title)}</strong> ${escapeHtml(view.feedback.toast.message)}</aside>`
    : "";
  const empty = view.empty
    ? `<p class="empty"><strong>${escapeHtml(view.empty.title)}</strong> ${escapeHtml(view.empty.description)}</p>`
    : "";
  const body =
    view.kind === "form"
      ? form
      : view.kind === "detail"
        ? detail
        : `<ul class="rows">${rows}</ul>${empty}`;
  return `<main data-kind="${escapeHtml(view.kind)}"><header><h1>${escapeHtml(view.title)}</h1>${search}</header>${body}${actions}${view.primary.enabled ? `<footer>${button(view.primary.title, "primary")}</footer>` : ""}${toast}</main>`;
}

export const pageModule = String.raw`import { render } from "/page.js";
const root = document.querySelector("#app");
const token = new URLSearchParams(location.search).get("t");
let view;
const send = (input) => fetch("/input?t=" + encodeURIComponent(token), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
const draw = (next) => { view = next; root.innerHTML = render(view); };
new EventSource("/events?t=" + encodeURIComponent(token)).onmessage = (event) => { const message = JSON.parse(event.data); if (message.type === "view") draw(message.view); if (message.type === "effect") { if (message.name === "clipboard.copy") navigator.clipboard?.writeText(message.params?.text ?? ""); if (message.name === "open.url") window.open(message.params?.url, "_blank", "noopener"); } };
document.addEventListener("keydown", (event) => { if (event.key === "ArrowDown") send({type:"move",direction:"down"}); else if (event.key === "ArrowUp") send({type:"move",direction:"up"}); else if (event.key === "Enter") send({type:"primary"}); else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") send({type:"openActions"}); else if (event.key === "Escape") send({type:"back"}); });
document.addEventListener("input", (event) => { const target = event.target; if (target?.id === "search") send({type:"search",text:target.value}); else if (target?.dataset.field) send({type:"setValue",id:target.dataset.field,value:target.value}); });
document.addEventListener("click", (event) => { const target = event.target.closest("[data-id]"); if (target) send({type:"select",id:target.dataset.id}); });
`;

export const pageSource = String.raw`const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(/"/g, "&quot;").replaceAll("'", "&#39;");
export function render(view) { const esc = escapeHtml; const rows = (view.rows ?? []).map((row) => \`<li\${row.selected ? ' class="selected"' : ''} data-id="\${esc(row.id)}">\${esc(row.text)}</li>\`).join(""); const actions = view.actions?.open ? \`<section class="actions"><strong>\${esc(view.actions.title)}</strong><ul>\${view.actions.rows.map((row) => \`<li\${row.selected ? ' class="selected"' : ''}>\${esc(row.title)} <small>\${esc(row.shortcut)}</small></li>\`).join("")}</ul></section>\` : ""; const fields = view.form ? \`<form>\${view.form.fields.map((field) => \`<label>\${esc(field.title || field.label)}<input data-field="\${esc(field.id)}" value="\${esc(field.text)}"></label>\`).join("")}</form>\` : ""; const search = \`<input id="search" value="\${esc(view.search?.text)}" placeholder="\${esc(view.search?.placeholder)}" aria-label="Search">\`; const toast = view.feedback?.toast ? \`<aside class="toast"><strong>\${esc(view.feedback.toast.title)}</strong> \${esc(view.feedback.toast.message)}</aside>\` : ""; return \`<main data-kind="\${esc(view.kind)}"><header><h1>\${esc(view.title)}</h1>\${search}</header>\${view.kind === "detail" ? \`<article class="detail">\${esc(view.detail)}</article>\` : view.kind === "form" ? fields : \`<ul class="rows">\${rows}</ul>\`}\${actions}\${toast}</main>\`; }`;

export const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Blast</title><style>body{font:16px system-ui;max-width:720px;margin:3rem auto;background:#111;color:#eee}input{background:#222;color:inherit;border:1px solid #555;padding:.6rem;width:100%;box-sizing:border-box}li{list-style:none;padding:.5rem}.rows,.actions ul{padding:0}.selected{background:#345;border-radius:.3rem}.actions,.toast{padding:1rem;background:#222;margin-top:1rem}.detail{white-space:pre-wrap}.empty{padding:1rem;color:#aaa}footer{margin-top:1rem}</style></head><body><div id="app"></div><script type="module">${pageModule.replace("./page.js", "/page.js")}</script></body></html>`;
