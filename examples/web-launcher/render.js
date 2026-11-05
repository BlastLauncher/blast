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

/**
 * @typedef {{text: string, error?: boolean, progress?: boolean}} FooterStatus
 * @typedef {{extensionTitle: string, commandTitle: string, icon?: string, iconUrl?: string}} ExtensionContext
 */

/** @param {FooterStatus} status */
function statusMarkup(status) {
  return `<span id="status" role="status" data-error="${status.error ? "true" : "false"}">${status.progress ? '<span class="status-spinner" aria-hidden="true"></span>' : ""}${escapeHtml(status.text)}</span>`;
}

/** @param {ExtensionContext | undefined} context */
function breadcrumbMarkup(context) {
  if (!context) return "";
  const icon = context.iconUrl
    ? `<img src="${escapeHtml(context.iconUrl)}" alt="" width="20" height="20" onerror="this.hidden=true">`
    : escapeHtml(context.icon ?? "⌘");
  return `<div class="breadcrumb"><span class="breadcrumb-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(context.extensionTitle)}</span><span class="breadcrumb-separator">›</span><span>${escapeHtml(context.commandTitle)}</span></div>`;
}

/** @param {import("@blastlauncher/client-core").ControllerView} view @param {{status?: FooterStatus, context?: ExtensionContext}} [options] */
export function render(view, options = {}) {
  const status = options.status ?? { text: "Ready" };
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
  const noRows =
    view.kind === "grid"
      ? (view.grid ?? []).every((row) => row.cells.length === 0)
      : view.rows.length === 0;
  const empty = view.empty
    ? `<p class="empty"><strong>${escapeHtml(view.empty.title)}</strong> ${escapeHtml(view.empty.description)}</p>`
    : noRows && (view.kind === "list" || view.kind === "grid")
      ? `<p class="empty">${escapeHtml(view.emptyText || "No results")}</p>`
      : "";
  const body =
    view.kind === "form"
      ? form
      : view.kind === "detail"
        ? detail
        : `<ul class="rows">${rows}</ul>${empty}`;
  const footer = `<footer>${statusMarkup(status)}<span class="footer-hints">${view.primary.enabled ? `${button(`${view.primary.shortcut || "↵"} ${view.primary.title}`, "primary")}` : ""}<span>Actions ⌘K</span><span>Esc Back</span></span></footer>`;
  return `<main data-kind="${escapeHtml(view.kind)}"><header>${breadcrumbMarkup(options.context)}<h1>${escapeHtml(view.title)}</h1>${search}</header>${body}${actions}${footer}${toast}</main>`;
}

/** @param {import("../browser-demo/root.ts").RootRow[]} rows @param {number} selected @param {string} query @param {{open?: boolean, query?: string, actions?: import("../browser-demo/root.ts").RootAction[], selected?: number, toast?: string, status?: FooterStatus}} [panel] */
export function renderRoot(rows, selected, query, panel = {}) {
  const options = rows
    .map(
      (row, index) =>
        `<li id="root-option-${index}" role="option" aria-selected="${index === selected}" data-root-index="${index}"${index === selected ? ' class="selected"' : ""}><span class="root-icon" aria-hidden="true">${row.iconUrl ? `<img src="${escapeHtml(row.iconUrl)}" alt="" width="24" height="24" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}<span${row.iconUrl ? " hidden" : ""}>${escapeHtml(row.icon)}</span></span><span class="root-copy"><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.subtitle)}</small></span><span class="root-accessory">${escapeHtml(row.accessory)}</span></li>`,
    )
    .join("");
  const actions = panel.open
    ? (panel.actions ?? [])
        .map(
          (action, index) =>
            `<li id="root-action-${index}" role="option" aria-selected="${index === panel.selected}" data-root-action-index="${index}"${index === panel.selected ? ' class="selected"' : ""}>${escapeHtml(action.title)}${action.shortcut ? ` <small>${escapeHtml(action.shortcut)}</small>` : ""}</li>`,
        )
        .join("")
    : "";
  const actionPanel = panel.open
    ? `<section class="actions" role="dialog" aria-label="Actions"><strong>Actions</strong><input id="root-action-search" value="${escapeHtml(panel.query ?? "")}" placeholder="Search actions…" aria-label="Search actions" role="combobox" aria-controls="root-actions" aria-activedescendant="${panel.selected !== undefined && panel.selected >= 0 ? `root-action-${panel.selected}` : ""}" autocomplete="off" autofocus><ul id="root-actions" role="listbox" aria-label="Command actions">${actions}</ul></section>`
    : "";
  const toast = panel.toast
    ? `<span role="status" class="root-toast">${escapeHtml(panel.toast)}</span>`
    : "";
  const status = panel.status ?? { text: "Ready" };
  return `<main class="root" data-kind="root"><header><h1>Blast</h1><input id="root-search" value="${escapeHtml(query)}" placeholder="Search extension commands…" aria-label="Search extension commands" role="combobox" aria-controls="root-options" aria-activedescendant="${selected >= 0 ? `root-option-${selected}` : ""}" autocomplete="off" autofocus></header><ul id="root-options" class="rows root-options" role="listbox" aria-label="Extension commands">${options}</ul>${rows.length === 0 ? '<p class="empty">No matching commands</p>' : ""}<footer>${statusMarkup(status)}<span class="footer-hints"><span>↵ Run Command</span><span>Actions ⌘K</span>${status.error ? "<span>Esc Back</span>" : ""}</span>${toast}</footer>${actionPanel}</main>`;
}
