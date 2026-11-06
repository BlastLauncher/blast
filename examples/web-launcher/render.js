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

/**
 * A footer hint is a real button: clicking it does what its key does. The
 * label is visible text and the key renders as a keycap.
 * @param {string} label
 * @param {string} key
 * @param {"primary" | "actions" | "back"} action
 */
const footerButton = (label, key, action) =>
  `<button type="button" class="footer-key" data-footer="${action}"><span>${escapeHtml(label)}</span><kbd>${escapeHtml(key)}</kbd></button>`;

/** @param {string} label @param {string} action @param {boolean} [selected] */
const button = (label, action, selected = false) =>
  `<button data-input="${escapeHtml(action)}"${selected ? ' class="selected"' : ""}>${escapeHtml(label)}</button>`;

/** @param {string} value */
const renderMarkdownInline = (value) => {
  let out = escapeHtml(value);
  out = out.replace(
    /!\[([^\]]*)\]\((https:[^\s)]+|data:image\/[^\s)]+)\)/giu,
    '<img src="$2" alt="$1">',
  );
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^\s)]+)\)/giu,
    '<a href="$2" rel="noreferrer noopener">$1</a>',
  );
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  return out;
};

/** Render the deliberately small, safe markdown subset used by Detail. @param {unknown} markdown */
export function renderMarkdown(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const result = [];
  let list = false;
  for (const line of lines) {
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (!list) {
        result.push("<ul>");
        list = true;
      }
      result.push(`<li>${renderMarkdownInline(item[1] ?? "")}</li>`);
      continue;
    }
    if (list) {
      result.push("</ul>");
      list = false;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      result.push(`<h${level}>${renderMarkdownInline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (!line.trim()) continue;
    result.push(`<p>${renderMarkdownInline(line)}</p>`);
  }
  if (list) result.push("</ul>");
  return result.join("");
}

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
  const search = `<input id="search" value="${escapeHtml(view.search.text)}" placeholder="${escapeHtml(view.search.placeholder)}" aria-label="Search">${view.dropdown ? `<button type="button" class="dropdown-trigger" data-dropdown-open aria-label="${escapeHtml(view.dropdown.tooltip || view.dropdown.label)}">${escapeHtml(view.dropdown.label || "Filter")}⌄</button>` : ""}`;
  const rows = view.rows
    .map((row) =>
      row.kind === "section"
        ? `<li class="section-header" data-id="${escapeHtml(row.id)}"><strong>${escapeHtml(row.title)}</strong>${row.count === null ? "" : `<small>${row.count}</small>`}</li>`
        : `<li${row.selected ? ' class="selected"' : ""} data-id="${escapeHtml(row.id)}"><span class="root-icon"${row.iconTint ? ` style="color:${escapeHtml(row.iconTint)}"` : ""}>${escapeHtml(row.iconLabel)}</span><span class="root-copy"><strong>${escapeHtml(row.title)}</strong>${row.subtitle ? `<small>${escapeHtml(row.subtitle)}</small>` : ""}</span>${row.accessories ? `<span class="root-accessory">${escapeHtml(row.accessories)}</span>` : ""}</li>`,
    )
    .join("");
  const grid = (view.grid ?? [])
    .map(
      (row) =>
        `${row.header ? `<li class="grid-header">${escapeHtml(row.header)}</li>` : ""}<li class="grid-row">${row.cells.map((cell) => `<button type="button" class="grid-cell${cell.selected ? " selected" : ""}" data-id="${escapeHtml(cell.id)}"><span class="grid-content">${escapeHtml(cell.content)}</span><strong>${escapeHtml(cell.title)}</strong><small>${escapeHtml(cell.subtitle)}</small></button>`).join("")}</li>`,
    )
    .join("");
  const dropdown = view.dropdown?.open
    ? `<section class="dropdown-panel" role="dialog" aria-label="${escapeHtml(view.dropdown.label)}"><input id="dropdown-search" data-dropdown-search value="${escapeHtml(view.dropdown.query)}" aria-label="Filter options"><ul>${view.dropdown.options.map((option) => `<li><button type="button" data-dropdown-value="${escapeHtml(option.value)}"${option.selected ? ' class="selected"' : ""}>${escapeHtml(option.title)}${option.current ? " ✓" : ""}</button></li>`).join("")}</ul></section>`
    : "";
  const actions = view.actions.open
    ? `<section class="actions"><strong>${escapeHtml(view.actions.title)}</strong><div class="breadcrumb">${view.actions.breadcrumb.map(escapeHtml).join(" / ")}</div><input id="action-search" value="${escapeHtml(view.actions.query)}" aria-label="Action search"><ul>${view.actions.rows.map((row, index) => `<li${row.selected ? ' class="selected"' : ""} data-action-index="${index}">${escapeHtml(row.title)} <small>${escapeHtml(row.shortcut)}</small></li>`).join("")}</ul></section>`
    : "";
  const form = view.form
    ? `<form class="extension-form">${view.form.fields
        .map((field) => {
          const label = escapeHtml(field.title || field.label || field.id);
          const common = `id="field-${escapeHtml(field.id)}" data-field="${escapeHtml(field.id)}"`;
          if (field.type === "Form.Separator") return `<hr class="form-separator">`;
          if (field.type === "Form.Description") return `<p class="form-description">${label}</p>`;
          if (field.type === "Form.Checkbox")
            return `<label class="form-field checkbox"><span>${label}</span><input ${common} type="checkbox"${field.checked ? " checked" : ""}></label>`;
          if (field.type === "Form.Dropdown" || field.type === "Form.TagPicker")
            return `<label class="form-field"><span>${label}</span><select ${common} ${field.type === "Form.TagPicker" ? "multiple" : ""}>${field.options.map((option) => `<option value="${escapeHtml(option.value)}"${field.selected.some((selected) => selected.value === option.value) ? " selected" : ""}>${escapeHtml(option.title)}</option>`).join("")}</select></label>`;
          if (field.type === "Form.DatePicker")
            return `<label class="form-field"><span>${label}</span><input ${common} type="date" value="${escapeHtml(field.text.slice(0, 10))}"></label>`;
          if (field.type === "Form.FilePicker")
            return `<p class="form-unavailable">${label}: not available in the browser</p>`;
          const area = field.type === "Form.TextArea";
          return `<label class="form-field"><span>${label}</span>${area ? `<textarea ${common} placeholder="${escapeHtml(field.placeholder)}">${escapeHtml(field.text)}</textarea>` : `<input ${common} type="${field.type === "Form.PasswordField" ? "password" : "text"}" value="${escapeHtml(field.text)}" placeholder="${escapeHtml(field.placeholder)}">`}</label>`;
        })
        .join("")}${button("Submit", "primary")}</form>`
    : "";
  const detail =
    view.kind === "detail"
      ? `<article class="detail">${renderMarkdown(view.detail)}</article>`
      : "";
  const toast = view.feedback.toast
    ? `<aside class="toast" data-style="${escapeHtml(view.feedback.toast.style)}"><strong>${escapeHtml(view.feedback.toast.title)}</strong> ${escapeHtml(view.feedback.toast.message)}${view.feedback.toast.actions.map((action, index) => `<button type="button" data-toast-action="${index}">${escapeHtml(action.title)} <small>${escapeHtml(action.shortcut)}</small></button>`).join("")}</aside>`
    : "";
  const hud = view.feedback.hud
    ? `<aside class="hud" role="status">${escapeHtml(view.feedback.hud.title)}</aside>`
    : "";
  const alert = view.feedback.alert
    ? `<section class="alert-backdrop"><dialog open class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alert-title"><h2 id="alert-title">${escapeHtml(view.feedback.alert.title)}</h2><p>${escapeHtml(view.feedback.alert.message)}</p>${view.feedback.alert.rememberUserChoice ? `<label><input id="alert-remember" type="checkbox"${view.feedback.alert.remember ? " checked" : ""}> Remember my choice</label>` : ""}<footer>${view.feedback.alert.dismiss ? `<button type="button" data-alert="dismiss">${escapeHtml(view.feedback.alert.dismiss.title)}</button>` : ""}${view.feedback.alert.primary ? `<button type="button" data-alert="confirm">${escapeHtml(view.feedback.alert.primary.title)}</button>` : ""}</footer></dialog></section>`
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
        : view.kind === "grid"
          ? `<ul class="grid">${grid}</ul>${empty}`
          : `<ul class="rows">${rows}</ul>${empty}`;
  const footer = `<footer>${statusMarkup(status)}<span class="footer-hints">${view.primary.enabled ? footerButton(view.primary.title, view.primary.shortcut || "↵", "primary") : ""}${footerButton("Actions", "⌘K", "actions")}${footerButton("Back", "Esc", "back")}</span></footer>`;
  return `<main data-kind="${escapeHtml(view.kind)}"><header>${breadcrumbMarkup(options.context)}<h1>${escapeHtml(view.title)}</h1><div class="search-line">${search}</div></header>${body}${actions}${dropdown}${footer}${toast}${hud}${alert}</main>`;
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
  return `<main class="root" data-kind="root"><header><h1>Blast</h1><input id="root-search" value="${escapeHtml(query)}" placeholder="Search extension commands…" aria-label="Search extension commands" role="combobox" aria-controls="root-options" aria-activedescendant="${selected >= 0 ? `root-option-${selected}` : ""}" autocomplete="off" autofocus></header><ul id="root-options" class="rows root-options" role="listbox" aria-label="Extension commands">${options}</ul>${rows.length === 0 ? '<p class="empty">No matching commands</p>' : ""}<footer>${statusMarkup(status)}<span class="footer-hints">${footerButton("Run Command", "↵", "primary")}${footerButton("Actions", "⌘K", "actions")}${status.error ? footerButton("Back", "Esc", "back") : ""}</span>${toast}</footer>${actionPanel}</main>`;
}

/** @param {import("../../packages/host/src/preference-fields.ts").Preference[]} fields @param {Record<string, unknown>} values @param {string} title @param {string[]} unavailable */
export function renderPreferences(fields, values, title, unavailable = []) {
  const rows = fields
    .map((field) => {
      const value = values[field.name] ?? field.default ?? (field.type === "checkbox" ? false : "");
      const required = field.required ? " *" : "";
      const description = field.description
        ? `<small class="preference-description">${escapeHtml(field.description)}</small>`
        : "";
      if (field.type === "checkbox")
        return `<label class="preference-row"><span>${escapeHtml(field.title)}${required}</span><input name="${escapeHtml(field.name)}" type="checkbox" data-preference="${escapeHtml(field.name)}"${value ? " checked" : ""}>${description}</label>`;
      if (field.type === "dropdown")
        return `<label class="preference-row"><span>${escapeHtml(field.title)}${required}</span><select name="${escapeHtml(field.name)}" data-preference="${escapeHtml(field.name)}">${field.data.map((option) => `<option value="${escapeHtml(option.value)}"${String(value) === option.value ? " selected" : ""}>${escapeHtml(option.title)}</option>`).join("")}</select>${description}</label>`;
      if (field.type === "file" || field.type === "directory" || field.type === "appPicker")
        return `<div class="preference-row unavailable"><strong>${escapeHtml(field.title)}${required}</strong><span>Needs a file on your computer; this is not available in the browser.</span>${description}</div>`;
      return `<label class="preference-row"><span>${escapeHtml(field.title)}${required}</span><input name="${escapeHtml(field.name)}" type="${field.type === "password" ? "password" : "text"}" data-preference="${escapeHtml(field.name)}" value="${escapeHtml(String(value))}" placeholder="${escapeHtml(field.placeholder ?? "")}">${description}</label>`;
    })
    .join("");
  const disabled =
    unavailable.length > 0 ||
    fields.some(
      (field) =>
        field.required &&
        field.default === undefined &&
        (values[field.name] === undefined || values[field.name] === ""),
    );
  return `<main class="preferences" data-kind="preferences"><header><h1>${escapeHtml(title)}</h1><p class="preference-note">These values stay in this browser only.</p></header><form id="preferences-form"><div class="preference-fields">${rows}</div><footer><span id="preference-error" role="alert"></span><span class="footer-hints"><button type="submit" class="footer-key"${disabled ? " disabled" : ""}><span>Run</span><kbd>↵</kbd></button><button type="button" class="footer-key" data-preference-back><span>Back</span><kbd>Esc</kbd></button></span></footer></form></main>`;
}
