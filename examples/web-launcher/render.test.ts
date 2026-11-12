import { expect, test } from "bun:test";
import { render, renderRoot } from "./render.js";

const view = {
  kind: "list",
  title: "Hello List",
  search: { text: "", placeholder: "Search" },
  rows: [],
  empty: { title: "Nothing here", description: "Try another search" },
  actions: { open: false, title: "Actions", breadcrumb: [], query: "", rows: [] },
  form: null,
  detail: "",
  feedback: { toast: null },
  primary: { enabled: true, title: "Run", shortcut: "↵" },
} as unknown as Parameters<typeof render>[0];

test("root view includes a footer and extension view includes breadcrumb context", () => {
  const root = renderRoot([], -1, "", { status: { text: "Ready" } });
  expect(root).toContain('id="status"');
  expect(root).toContain('data-footer="actions"');
  expect(root).toContain("<kbd>⌘K</kbd>");
  const extension = render(view, {
    context: { extensionTitle: "Fixture Extension", commandTitle: "Hello List", icon: "⌘" },
    status: { text: "Starting…", progress: true },
  });
  expect(extension).toContain("Fixture Extension");
  expect(extension).toContain("Hello List");
  expect(extension).toContain("Starting…");
});

test("error status renders with the footer error style", () => {
  const html = renderRoot([], -1, "", { status: { text: "Failed", error: true } });
  expect(html).toContain('data-error="true"');
  expect(html).toContain("Failed");
});

test("extension and root scenes expose whether the command is still loading", () => {
  expect(render({ ...view, loading: true } as unknown as Parameters<typeof render>[0])).toContain(
    'data-loading="true" aria-busy="true"',
  );
  expect(render({ ...view, loading: false } as unknown as Parameters<typeof render>[0])).toContain(
    'data-loading="false" aria-busy="false"',
  );
  expect(renderRoot([], -1, "")).toContain('data-loading="false"');
});

test("an empty list shows the extension EmptyView, else a neutral hint", () => {
  const withEmptyView = render(view);
  expect(withEmptyView).toContain("Nothing here");
  expect(withEmptyView).toContain("Try another search");
  const bare = { ...view, empty: null, emptyText: "No results" };
  expect(render(bare as unknown as Parameters<typeof render>[0])).toContain("No results");
});

test("menu-bar markup includes title, sections, item details, submenu, disabled and selected states", () => {
  const menu = render({
    ...view,
    kind: "menu-bar",
    title: "Modes",
    menuBar: {
      title: "Modes",
      tooltip: "Open modes",
      loading: false,
      path: [],
      selectedId: "run",
      rows: [
        {
          id: "section",
          kind: "section",
          title: "Actions",
          subtitle: "",
          iconLabel: "",
          shortcut: "",
          disabled: true,
          selected: false,
        },
        {
          id: "run",
          kind: "item",
          title: "Run",
          subtitle: "Do it",
          iconLabel: "▶",
          iconTint: "green",
          shortcut: "⌘R",
          disabled: false,
          selected: true,
        },
        {
          id: "more",
          kind: "submenu",
          title: "More",
          subtitle: "",
          iconLabel: "★",
          shortcut: "",
          disabled: false,
          selected: false,
        },
        {
          id: "off",
          kind: "item",
          title: "Disabled",
          subtitle: "",
          iconLabel: "",
          shortcut: "",
          disabled: true,
          selected: false,
        },
      ],
    },
  } as unknown as Parameters<typeof render>[0]);
  expect(menu).toContain('aria-label="Open modes"');
  expect(menu).toContain('class="menu-section"');
  expect(menu).toContain('class="selected"');
  expect(menu).toContain('class="menu-icon" style="color:green">▶</span>');
  expect(menu).toContain("Do it");
  expect(menu).toContain("⌘R");
  expect(menu).toContain("More");
  expect(menu).toContain("›");
  expect(menu).toContain("disabled");
});

test("a browser-reserved shortcut is muted with its hint; the Actions key follows the platform", () => {
  const panel = {
    ...view,
    actions: {
      open: true,
      title: "Actions",
      breadcrumb: [],
      query: "",
      rows: [
        { id: "a", kind: "action", title: "New Tab", shortcut: "Ctrl+T", selected: true },
        { id: "b", kind: "action", title: "Reload", shortcut: "Ctrl+R", selected: false },
      ],
    },
  } as unknown as Parameters<typeof render>[0];
  const html = render(panel, {
    actionsKey: "Ctrl+K",
    reservedHint: (label) => (label === "Ctrl+T" ? "Browser reserved" : ""),
  });
  expect(html).toContain('<small class="reserved" title="Browser reserved"');
  expect(html).toContain("<small>Ctrl+R</small>");
  expect(html).toContain("<kbd>Ctrl+K</kbd>");
  expect(render(panel)).toContain("<small>Ctrl+T</small>");
});
