import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { render } from "../../packages/web/src/render.js";
import { startWebLauncher } from "./server.ts";
import type { ControllerView } from "@blastlauncher/client-core";

const view = (patch: Partial<ControllerView> = {}): ControllerView => ({
  kind: "list",
  title: "Things",
  navigation: { canGoBack: false },
  loading: false,
  search: { text: "", placeholder: "Search" },
  rows: [
    {
      id: "1",
      kind: "item",
      title: "A",
      subtitle: "",
      accessories: "",
      icon: false,
      count: null,
      selected: true,
      iconLabel: "",
      text: "A",
    },
  ],
  grid: null,
  selectedId: "1",
  emptyText: "",
  empty: null,
  detail: "# Detail",
  primary: { title: "Run", shortcut: "↵", enabled: true },
  actions: {
    open: false,
    title: "Actions",
    query: "",
    breadcrumb: [],
    rows: [],
    selectedIndex: -1,
  },
  dropdown: null,
  feedback: { toast: null, hud: null, alert: null },
  menuBar: null,
  form: null,
  requests: { quit: false, clearSearch: false },
  ...patch,
});

test("render draws list, selection, detail, action panel, form and toast", () => {
  const detail = render(
    view({
      kind: "detail",
      detail: "hello",
      actions: {
        open: true,
        title: "Actions",
        query: "",
        breadcrumb: [],
        rows: [{ id: "a", kind: "action", title: "Copy", shortcut: "⌘C", selected: true }],
        selectedIndex: 0,
      },
      feedback: {
        toast: { style: "success", title: "Done", message: "Copied", actions: [] },
        hud: null,
        alert: null,
      },
    }),
  );
  const form = render(
    view({
      kind: "form",
      form: {
        items: [{ kind: "field", id: "name" }],
        fields: [
          {
            id: "name",
            type: "TextField",
            title: "Name",
            info: "",
            label: "",
            placeholder: "",
            error: "",
            value: "x",
            text: "x",
            checked: false,
            hasValue: true,
            selected: [],
            options: [],
            optionIndex: 0,
            query: "",
            focused: true,
          },
        ],
        focusId: "name",
      },
    }),
  );
  expect(detail).toContain("Actions");
  expect(detail).toContain("Done");
  expect(detail).toContain("hello");
  expect(form).toContain("Name");
});

test("render escapes HTML injection", () => {
  const html = render(
    view({
      title: "<script>alert(1)</script>",
      rows: [{ ...view().rows[0]!, text: "<img src=x onerror=alert(1)>" }],
    }),
  );
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
});

test("serves the exact renderer module imported by tests", async () => {
  const launcher = await startWebLauncher({ extensionDir: "./fixtures/extensions/hello-list" });
  try {
    const response = await fetch(launcher.url.replace("/?", "/render.js?"));
    expect(await response.text()).toBe(
      await readFile(new URL("../../packages/web/src/render.js", import.meta.url), "utf8"),
    );
  } finally {
    await launcher.close();
  }
});
