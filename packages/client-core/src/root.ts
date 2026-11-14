import { rankGroups, score, type Group } from "./rank.ts";
import type { IconView } from "./icons.ts";
import type { ControllerView, RowView } from "./controller.ts";

/** A command exposed by an opened extension in the engine launcher. */
export type RootCommand = {
  extension: string;
  extensionTitle?: string;
  command: string;
  title: string;
  subtitle?: string;
  description?: string;
  mode?: string;
  icon?: IconView;
};
export type RootEffect = { type: "launch"; extension: string; command: string };
export type RootResult = { events: never[]; effects: RootEffect[] };
export type RootInput =
  | { type: "search"; text: string }
  | { type: "move"; direction: "up" | "down" | "left" | "right" }
  | { type: "select"; id: string }
  | { type: "primary" | "back" | "openActions" | "closeActions" };
export type RootController = {
  input(input: RootInput): RootResult;
  view(): ControllerView;
  subscribe(listener: (view: ControllerView) => void): () => void;
};

const emptyView = (): ControllerView => ({
  kind: "list",
  title: "",
  navigation: { canGoBack: false },
  loading: false,
  search: { text: "", placeholder: "Search commands…" },
  rows: [],
  grid: null,
  selectedId: null,
  emptyText: "No commands",
  empty: null,
  detail: "",
  primary: { title: "Open Command", shortcut: "", enabled: false },
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
});

export function createRootController(commands: RootCommand[]): RootController {
  let query = "";
  let selected = 0;
  let actionOpen = false;
  const listeners = new Set<(view: ControllerView) => void>();
  const id = (c: RootCommand) => `${c.extension}:${c.command}`;
  const groups = (): Group<RootCommand, string>[] => {
    const by = new Map<string, RootCommand[]>();
    for (const command of commands)
      by.set(command.extension, [...(by.get(command.extension) ?? []), command]);
    return [...by].map(([extension, items]) => ({ section: extension, items }));
  };
  const visible = () =>
    rankGroups(
      groups(),
      query,
      (c) =>
        score(
          {
            title: c.title,
            ...(c.subtitle === undefined ? {} : { subtitle: c.subtitle }),
            keywords: [c.command, c.extension, c.extensionTitle ?? ""],
          },
          query,
        ),
      { enabled: true, keepSectionOrder: true },
    ).flatMap((g) => g.items);
  const view = (): ControllerView => {
    const items = visible();
    selected = Math.max(0, Math.min(selected, items.length - 1));
    const rows: RowView[] = [];
    let last = "";
    for (const command of items) {
      if (command.extension !== last) {
        last = command.extension;
        rows.push({
          id: `section:${last}`,
          kind: "section",
          title: command.extensionTitle ?? last,
          subtitle: "",
          accessories: "",
          icon: false,
          count: null,
          selected: false,
          iconLabel: "",
          text: command.extensionTitle ?? last,
        });
      }
      const row: RowView = {
        id: id(command),
        kind: "item" as const,
        title: command.title,
        subtitle: command.subtitle ?? command.description ?? "",
        accessories: command.mode ?? "",
        icon: !!command.icon,
        count: null,
        selected: rows.filter((r) => r.kind === "item").length === selected,
        iconLabel: command.icon?.label ?? "",
        text: `${command.title}${command.subtitle ? `  ${command.subtitle}` : ""}`,
      };
      if (command.icon?.tint) row.iconTint = command.icon.tint;
      if (command.icon?.source) row.iconSource = command.icon.source;
      if (command.icon?.mask) row.iconMask = command.icon.mask;
      rows.push(row);
    }
    const chosen = items[selected];
    const result = emptyView();
    return {
      ...result,
      title: "Commands",
      search: { text: query, placeholder: "Search commands…" },
      rows,
      selectedId: chosen ? id(chosen) : null,
      primary: { title: "Open Command", shortcut: "", enabled: !!chosen },
      actions: {
        ...result.actions,
        open: actionOpen,
        rows:
          actionOpen && chosen
            ? [
                { id: "open", kind: "action", title: "Open Command", shortcut: "", selected: true },
                {
                  id: "configure",
                  kind: "action",
                  title: "Configure",
                  shortcut: "",
                  selected: false,
                },
              ]
            : [],
      },
    };
  };
  const notify = () => {
    const next = view();
    for (const listener of listeners) listener(next);
  };
  const launch = (): RootResult => {
    const command = visible()[selected];
    return {
      events: [],
      effects: command
        ? [{ type: "launch", extension: command.extension, command: command.command }]
        : [],
    };
  };
  return {
    input(input) {
      if (input.type === "search") {
        query = input.text;
        selected = 0;
        notify();
        return { events: [], effects: [] };
      }
      const items = visible();
      if (input.type === "move")
        selected = Math.max(
          0,
          Math.min(
            items.length - 1,
            selected + (input.direction === "down" ? 1 : input.direction === "up" ? -1 : 0),
          ),
        );
      else if (input.type === "select") {
        const i = items.findIndex((c) => id(c) === input.id);
        if (i >= 0) selected = i;
      } else if (input.type === "primary") return launch();
      else if (input.type === "openActions") actionOpen = true;
      else if (input.type === "closeActions" || input.type === "back") actionOpen = false;
      notify();
      return { events: [], effects: [] };
    },
    view,
    subscribe(listener) {
      listeners.add(listener);
      listener(view());
      return () => listeners.delete(listener);
    },
  };
}
