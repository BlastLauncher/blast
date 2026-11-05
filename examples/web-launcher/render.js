// @ts-check

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** @param {string} label @param {string} action @param {boolean} [selected] */
const button = (label, action, selected = false) =>
  `<button data-input="${escapeHtml(action)}"${selected ? ' class="selected"' : ""}>${escapeHtml(label)}</button>`;

/** @param {import("@blastlauncher/client-core").ControllerView} view */
export function render(view) {
  const search = `<input id="search" value="${escapeHtml(view.search.text)}" placeholder="${escapeHtml(view.search.placeholder)}" aria-label="Search">`;
  const rows = view.rows
    .map(
      (row) =>
        `<li${row.selected ? ' class="selected"' : ""} data-id="${escapeHtml(row.id)}">${escapeHtml(row.text)}</li>`,
    )
    .join("");
  const actions = view.actions.open
    ? `<section class="actions"><strong>${escapeHtml(view.actions.title)}</strong><div class="breadcrumb">${view.actions.breadcrumb.map(escapeHtml).join(" / ")}</div><input id="action-search" value="${escapeHtml(view.actions.query)}" aria-label="Action search"><ul>${view.actions.rows.map((row, index) => `<li${row.selected ? ' class="selected"' : ""} data-action-index="${index}">${escapeHtml(row.title)} <small>${escapeHtml(row.shortcut)}</small></li>`).join("")}</ul></section>`
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
