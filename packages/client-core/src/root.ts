import { rankGroups, score, type Group } from "./rank.ts";
import { iconFields, type IconView } from "./icons.ts";
import type { ControllerInput, ControllerView, RowView } from "./controller.ts";
import { matchesShortcut, shortcutLabel, type Platform } from "./shortcut.ts";

// The engine's root search: one list over every opened extension's commands.
// Same shape as a command's `ControllerView`, so an embedder draws it with the
// code it already has. No I/O; launching comes back as a `launch` effect.

/** A command exposed by an opened extension. `extension` is the grouping and launch key. */
export type RootCommand = {
  extension: string;
  extensionTitle?: string;
  command: string;
  title: string;
  subtitle?: string;
  description?: string;
  mode?: "view" | "no-view" | "menu-bar";
  icon?: IconView;
};
/** `launch` runs the command; `configure` opens its preferences form without running it. */
export type RootEffect = {
  type: "launch" | "configure";
  extension: string;
  command: string;
  scope?: "extension" | "command";
};
export type RootResult = { effects: RootEffect[] };
/** Any controller input is accepted; those with no meaning in the root list are ignored. */
export type RootInput = ControllerInput;
export type RootController = {
  input(input: RootInput): RootResult;
  /** Replace the catalog (an extension opened, closed or edited). Selection follows the command. */
  setCatalog(commands: RootCommand[]): void;
  /** Show a failure toast until the next input. */
  fail(title: string, message: string): void;
  /** Come back from a command: clears the search, selection and any toast. */
  reset(): void;
  view(): ControllerView;
  subscribe(listener: (view: ControllerView) => void): () => void;
};

const PLACEHOLDER = "Search commands…";
const OPEN = "Open Command";
const CONFIGURE = "Configure Command";
const CONFIGURE_KEYS = { modifiers: ["cmd", "shift"], key: "," };
const ACTIONS = [{ id: "open" }, { id: "configure" }] as const;
const MODE_LABELS = { view: "Command", "no-view": "No View", "menu-bar": "Menu Bar" } as const;

const commandId = (command: RootCommand) => `${command.extension}:${command.command}`;

export function createRootController(
  initial: RootCommand[] = [],
  options: { platform?: Platform } = {},
): RootController {
  const platform = options.platform ?? "Linux";
  let catalog = initial;
  let query = "";
  let selectedId: string | null = null;
  let actionsOpen = false;
  let actionIndex = 0;
  let failure: { title: string; message: string } | null = null;
  const listeners = new Set<(view: ControllerView) => void>();

  // Sections are extensions in catalog order; a query orders items by score inside each.
  const visible = (): RootCommand[] => {
    const byExtension = new Map<string, RootCommand[]>();
    for (const command of catalog) {
      const items = byExtension.get(command.extension);
      if (items) items.push(command);
      else byExtension.set(command.extension, [command]);
    }
    const groups: Group<RootCommand, string>[] = [...byExtension].map(([section, items]) => ({
      section,
      items,
    }));
    return rankGroups(
      groups,
      query,
      (c) =>
        score(
          {
            title: c.title,
            subtitle: c.subtitle || c.description || "",
            keywords: [c.command, c.extension, c.extensionTitle ?? ""],
          },
          query,
        ),
      { enabled: true, keepSectionOrder: true },
    ).flatMap((group) => group.items);
  };
  // The chosen command, falling back to the first when it disappeared (live catalog).
  const chosen = (items: RootCommand[]): RootCommand | undefined =>
    items.find((c) => commandId(c) === selectedId) ?? items[0];

  const view = (): ControllerView => {
    const items = visible();
    const current = chosen(items);
    const rows: RowView[] = [];
    let section: string | undefined;
    for (const command of items) {
      if (command.extension !== section) {
        section = command.extension;
        const title = command.extensionTitle ?? section;
        rows.push({
          id: `section:${section}`,
          kind: "section",
          title,
          subtitle: "",
          accessories: "",
          icon: false,
          count: items.filter((c) => c.extension === section).length,
          selected: false,
          iconLabel: "",
          text: title,
        });
      }
      const subtitle = command.subtitle || command.description || "";
      rows.push({
        id: commandId(command),
        kind: "item",
        title: command.title,
        subtitle,
        accessories: command.mode ? MODE_LABELS[command.mode] : "",
        icon: !!command.icon,
        count: null,
        selected: command === current,
        iconLabel: command.icon?.label ?? "",
        ...iconFields(command.icon),
        text: subtitle ? `${command.title}  ${subtitle}` : command.title,
      });
    }
    return {
      kind: "list",
      title: "Commands",
      navigation: { canGoBack: false },
      loading: false,
      search: { text: query, placeholder: PLACEHOLDER },
      rows,
      grid: null,
      selectedId: current ? commandId(current) : null,
      emptyText: query ? "No matching commands" : "No commands",
      empty: null,
      detail: "",
      primary: { title: OPEN, shortcut: "", enabled: !!current },
      actions: {
        open: actionsOpen && !!current,
        title: current?.title ?? "Actions",
        query: "",
        breadcrumb: [],
        rows:
          actionsOpen && current
            ? [
                {
                  id: "open",
                  kind: "action",
                  title: OPEN,
                  shortcut: "",
                  selected: actionIndex === 0,
                },
                {
                  id: "configure",
                  kind: "action",
                  title: CONFIGURE,
                  shortcut: shortcutLabel(CONFIGURE_KEYS, platform),
                  selected: actionIndex === 1,
                },
              ]
            : [],
        selectedIndex: actionsOpen && current ? actionIndex : -1,
      },
      dropdown: null,
      feedback: {
        toast: failure && { style: "failure", ...failure, actions: [] },
        hud: null,
        alert: null,
      },
      menuBar: null,
      form: null,
      requests: { quit: false, clearSearch: false },
    };
  };
  const notify = () => {
    const next = view();
    for (const listener of listeners) listener(next);
  };
  const run = (type: RootEffect["type"]): RootResult => {
    const current = chosen(visible());
    actionsOpen = false;
    return {
      effects:
        current
          ? [
              {
                type,
                extension: current.extension,
                command: current.command,
                ...(type === "configure" ? { scope: "command" as const } : {}),
              },
            ]
          : [],
    };
  };

  return {
    input(input) {
      failure = null;
      let result: RootResult = { effects: [] };
      switch (input.type) {
        case "search":
          query = input.text;
          selectedId = null;
          actionsOpen = false;
          break;
        case "move": {
          const items = visible();
          const step = input.direction === "down" ? 1 : input.direction === "up" ? -1 : 0;
          const current = chosen(items);
          if (actionsOpen) {
            actionIndex = Math.max(0, Math.min(ACTIONS.length - 1, actionIndex + step));
            break;
          }
          const next = items[(current ? items.indexOf(current) : 0) + step];
          if (next) selectedId = commandId(next);
          break;
        }
        case "select": {
          const picked = visible().find((c) => commandId(c) === input.id);
          if (picked) selectedId = commandId(picked);
          break;
        }
        case "primary":
          result = run(
            actionsOpen && ACTIONS[actionIndex]?.id === "configure" ? "configure" : "launch",
          );
          break;
        case "key":
          if (matchesShortcut(CONFIGURE_KEYS, input.key, platform)) result = run("configure");
          break;
        case "openActions":
          actionsOpen = true;
          actionIndex = 0;
          break;
        case "closeActions":
        case "back":
          actionsOpen = false;
          break;
        default:
          break;
      }
      notify();
      return result;
    },
    setCatalog(commands) {
      catalog = commands;
      notify();
    },
    fail(title, message) {
      failure = { title, message };
      notify();
    },
    reset() {
      query = "";
      actionsOpen = false;
      failure = null;
      notify();
    },
    view,
    subscribe(listener) {
      listeners.add(listener);
      listener(view());
      return () => listeners.delete(listener);
    },
  };
}
