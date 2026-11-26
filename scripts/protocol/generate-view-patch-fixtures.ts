// Generates `fixtures/protocol/view-patches.json` from the reference TypeScript
// `diffView` (decision 0020). Go, Python and Swift embedder tests all load this
// file, apply every case, and assert exact equality with `next`.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { diffView, type JsonValue, type ViewPatchOp } from "../../packages/protocol/src/index.ts";

export const VIEW_PATCH_FIXTURES_FILE = "fixtures/protocol/view-patches.json";

export type ViewPatchFixtureCase = {
  name: string;
  prev: JsonValue;
  patch: {
    baseRevision: number;
    revision: number;
    ops: ViewPatchOp[];
  };
  next: JsonValue;
};

export type ViewPatchFixtures = {
  cases: ViewPatchFixtureCase[];
};

type RowSpec = {
  id: string;
  title: string;
  subtitle: string;
  accessories: string;
  selected: boolean;
};

function makeRow(row: RowSpec): JsonValue {
  return {
    id: row.id,
    kind: "item",
    title: row.title,
    subtitle: row.subtitle,
    accessories: row.accessories,
    icon: false,
    count: null,
    selected: row.selected,
    iconLabel: "",
    text: `${row.title} ${row.subtitle} ${row.accessories}`.trim(),
  };
}

function makeListView(options: {
  title?: string;
  searchText: string;
  rows: RowSpec[];
  primaryTitle: string;
  primaryEnabled?: boolean;
  empty?: JsonValue;
  toast?: JsonValue;
  dropdown?: JsonValue;
  breadcrumb?: string[];
}): JsonValue {
  const selected = options.rows.find((row) => row.selected) ?? null;
  return {
    kind: "list",
    title: options.title ?? "Fruits",
    loading: false,
    navigation: { canGoBack: false },
    search: { text: options.searchText, placeholder: "Search fruits..." },
    selectedId: selected ? selected.id : null,
    rows: options.rows.map(makeRow),
    grid: null,
    emptyText: "No results",
    empty: options.empty ?? null,
    detail: "",
    primary: {
      title: options.primaryTitle,
      shortcut: "↵",
      enabled: options.primaryEnabled ?? options.rows.length > 0,
    },
    actions: {
      open: false,
      title: "Actions",
      query: "",
      breadcrumb: options.breadcrumb ?? [],
      rows: [
        { id: "copy", kind: "action", title: options.primaryTitle, shortcut: "↵", selected: true },
      ],
      selectedIndex: 0,
    },
    dropdown: options.dropdown ?? null,
    feedback: {
      toast: options.toast ?? null,
      hud: null,
      alert: null,
    },
    menuBar: null,
    form: null,
    requests: { quit: false, clearSearch: false },
  };
}

function makeCase(
  name: string,
  prev: JsonValue,
  next: JsonValue,
  baseRevision = 1,
): ViewPatchFixtureCase {
  return {
    name,
    prev,
    patch: {
      baseRevision,
      revision: baseRevision + 1,
      ops: diffView(prev, next),
    },
    next,
  };
}

export function buildViewPatchFixtures(): ViewPatchFixtures {
  const baseRows: RowSpec[] = [
    { id: "r1", title: "apple", subtitle: "crisp", accessories: "red", selected: true },
    { id: "r2", title: "banana", subtitle: "sweet", accessories: "yellow", selected: false },
    { id: "r3", title: "cherry", subtitle: "tart", accessories: "red", selected: false },
    { id: "r4", title: "date", subtitle: "chewy", accessories: "brown", selected: false },
  ];

  const listInitial = makeListView({
    searchText: "",
    rows: baseRows,
    primaryTitle: "Copy apple",
  });

  const listMoved = makeListView({
    searchText: "",
    rows: baseRows.map((row, index) => ({ ...row, selected: index === 1 })),
    primaryTitle: "Copy banana",
  });

  const listEdited = makeListView({
    searchText: "",
    rows: [
      baseRows[0]!,
      {
        id: "r2",
        title: "banana (pinned)",
        subtitle: "sweet",
        accessories: "pinned",
        selected: false,
      },
      baseRows[2]!,
      baseRows[3]!,
    ],
    primaryTitle: "Copy apple",
  });

  const listFiltered = makeListView({
    searchText: "a",
    rows: [baseRows[0]!, baseRows[1]!],
    primaryTitle: "Copy apple",
  });

  const emptyState: JsonValue = {
    title: "No fruits",
    description: "Try a shorter query",
    iconLabel: "",
    iconTint: null,
  };

  const listEmpty = makeListView({
    searchText: "zzz",
    rows: [],
    primaryTitle: "Run",
    primaryEnabled: false,
    empty: emptyState,
  });

  const toastLoading: JsonValue = {
    style: "animated",
    title: "Copying",
    message: "apple",
    actions: [{ title: "Cancel", shortcut: "Esc" }],
  };

  const dropdownOpen: JsonValue = {
    label: "Color",
    tooltip: "Filter by color",
    open: true,
    query: "",
    options: [
      { value: "all", title: "All", section: "", current: true, selected: true },
      { value: "red", title: "Red", section: "", current: false, selected: false },
    ],
    selectedIndex: 0,
  };

  const withToastAndDropdown = makeListView({
    searchText: "",
    rows: baseRows,
    primaryTitle: "Copy apple",
    toast: toastLoading,
    dropdown: dropdownOpen,
    breadcrumb: ["Items"],
  });

  const withBreadcrumbAndAction = makeListView({
    searchText: "",
    rows: baseRows,
    primaryTitle: "Copy apple",
    toast: {
      style: "animated",
      title: "Copying",
      message: "apple",
      actions: [
        { title: "Cancel", shortcut: "Esc" },
        { title: "Retry", shortcut: "⌘R" },
      ],
    },
    dropdown: dropdownOpen,
    breadcrumb: ["Root", "Items"],
  });

  const optionalBefore: JsonValue = {
    kind: "empty",
    title: "Before",
    iconTint: "#ff0000",
    empty: {
      title: "Nothing yet",
      iconTint: "#00ff00",
    },
  };
  const optionalAfter: JsonValue = {
    kind: "empty",
    title: "After",
    empty: {
      title: "Nothing yet",
      iconMask: "circle",
    },
  };

  return {
    cases: [
      makeCase("selection-move", listInitial, listMoved, 1),
      makeCase("one-row-edit", listInitial, listEdited, 2),
      makeCase("search-filter", listInitial, listFiltered, 3),
      makeCase("search-filter-empty", listFiltered, listEmpty, 4),
      makeCase("null-to-object", listInitial, withToastAndDropdown, 5),
      makeCase("object-to-null", withToastAndDropdown, listInitial, 6),
      makeCase("optional-key-delete", optionalBefore, optionalAfter, 7),
      makeCase("array-prepend-and-append", withToastAndDropdown, withBreadcrumbAndAction, 8),
      makeCase("root-null-to-object", null, { kind: "empty", title: "Ready" }, 9),
      makeCase("noop-empty-ops", listInitial, structuredClone(listInitial), 10),
    ],
  };
}

export function serializeViewPatchFixtures(): string {
  return `${JSON.stringify(buildViewPatchFixtures(), null, 2)}\n`;
}

export function writeViewPatchFixtures(root: string): void {
  const path = join(root, VIEW_PATCH_FIXTURES_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeViewPatchFixtures());
}

if (import.meta.main) {
  writeViewPatchFixtures(process.cwd());
  console.log(`protocol: wrote ${VIEW_PATCH_FIXTURES_FILE}`);
}
