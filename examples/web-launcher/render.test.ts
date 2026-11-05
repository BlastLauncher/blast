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
  expect(root).toContain("Actions ⌘K");
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
