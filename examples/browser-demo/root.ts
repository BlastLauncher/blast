import { rankGroups, score, type Searchable } from "../../packages/client-core/src/rank.ts";

export type CatalogCommand = { name: string; title: string; subtitle?: string; mode: string };
export type CatalogExtension = {
  name: string;
  title: string;
  description?: string;
  icon?: string;
  commands: CatalogCommand[];
};
export type Catalog = { commit: string; extensions: CatalogExtension[] };
export type RootRow = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconUrl?: string;
  accessory: string;
  extension: string;
  command: string;
  url?: string;
  githubUrl?: string;
};

export type RootActionId = "run" | "github" | "copy";
export type RootAction = { id: RootActionId; title: string; shortcut: string };
export type RootActionResult =
  | { type: "run" }
  | { type: "open"; url: string }
  | { type: "copy"; url: string };

const curated = new Set(["ratio-calculator", "hello-list", "weather", "github", "calendar"]);

export function validateCatalog(value: unknown): Catalog {
  if (!value || typeof value !== "object") throw new Error("Invalid browser catalog");
  const input = value as Record<string, unknown>;
  if (typeof input.commit !== "string" || !Array.isArray(input.extensions))
    throw new Error("Invalid browser catalog shape");
  const extensions = input.extensions.map((extension) => {
    if (!extension || typeof extension !== "object") throw new Error("Invalid catalog extension");
    const item = extension as Record<string, unknown>;
    if (
      typeof item.name !== "string" ||
      typeof item.title !== "string" ||
      !Array.isArray(item.commands)
    )
      throw new Error("Invalid catalog extension shape");
    const commands = item.commands.map((command) => {
      if (!command || typeof command !== "object") throw new Error("Invalid catalog command");
      const commandValue = command as Record<string, unknown>;
      if (
        typeof commandValue.name !== "string" ||
        typeof commandValue.title !== "string" ||
        typeof commandValue.mode !== "string"
      )
        throw new Error("Invalid catalog command shape");
      return {
        name: commandValue.name,
        title: commandValue.title,
        mode: commandValue.mode,
        ...(typeof commandValue.subtitle === "string" ? { subtitle: commandValue.subtitle } : {}),
      };
    });
    return {
      name: item.name,
      title: item.title,
      commands,
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(typeof item.icon === "string" ? { icon: item.icon } : {}),
    };
  });
  const names = extensions.map((extension) => extension.name);
  if (names.some((name, index) => index > 0 && name.localeCompare(names[index - 1]!) < 0))
    throw new Error("Catalog extensions are not sorted");
  return { commit: input.commit, extensions };
}

function row(extension: CatalogExtension, command: CatalogCommand, commit: string): RootRow {
  return {
    id: `${extension.name}:${command.name}`,
    title: command.title,
    subtitle: command.subtitle ?? extension.title,
    icon: "⌘",
    ...(extension.icon
      ? {
          iconUrl: `https://raw.githubusercontent.com/raycast/extensions/${commit}/extensions/${extension.name}/assets/${extension.icon}`,
        }
      : {}),
    accessory: "Command",
    extension: extension.name,
    command: command.name,
    githubUrl: `https://github.com/raycast/extensions/tree/${commit}/extensions/${extension.name}`,
  };
}

export function rootRows(catalog: Catalog, query: string): RootRow[] {
  const all = catalog.extensions.flatMap((extension) =>
    extension.commands.map((command) => row(extension, command, catalog.commit)),
  );
  const searchable = (item: RootRow): Searchable => ({
    title: item.title,
    subtitle: item.subtitle,
    keywords: [item.extension, item.command],
  });
  const ranked =
    rankGroups([{ items: all }], query, (item) => score(searchable(item), query), {
      enabled: true,
      keepSectionOrder: true,
    })[0]?.items ?? [];
  if (query) return ranked;
  return ranked.toSorted(
    (a, b) =>
      Number(curated.has(b.extension)) - Number(curated.has(a.extension)) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}

export function rootModel(catalog: Catalog, query: string, selected: number, url?: string) {
  const rows = rootRows(catalog, query);
  const candidate =
    url ?? (query.trim().startsWith("https://github.com/") ? query.trim() : undefined);
  const urlRow = candidate
    ? ({
        id: "url",
        title: "Run from URL",
        subtitle: candidate,
        icon: "↗",
        accessory: "Command",
        extension: candidate,
        command: "index",
        url: candidate,
        githubUrl: candidate,
      } satisfies RootRow)
    : undefined;
  const visible = urlRow ? [urlRow, ...rows] : rows;
  return {
    rows: visible,
    selected: visible.length === 0 ? -1 : Math.max(0, Math.min(selected, visible.length - 1)),
  };
}

export function rootActions(selectedRow: RootRow | undefined): RootAction[] {
  if (!selectedRow) return [];
  return [
    { id: "run", title: "Run Command", shortcut: "↵" },
    { id: "github", title: "Open Extension on GitHub", shortcut: "" },
    { id: "copy", title: "Copy Extension URL", shortcut: "" },
  ];
}

export function rootActionModel(selectedRow: RootRow | undefined, query: string, selected: number) {
  const normalized = query.trim().toLocaleLowerCase();
  const actions = rootActions(selectedRow).filter((action) =>
    normalized ? action.title.toLocaleLowerCase().includes(normalized) : true,
  );
  return {
    actions,
    selected: actions.length === 0 ? -1 : Math.max(0, Math.min(selected, actions.length - 1)),
  };
}

export function executeRootAction(selectedRow: RootRow, action: RootActionId): RootActionResult {
  if (action === "run") return { type: "run" };
  if (action === "github") return { type: "open", url: selectedRow.githubUrl ?? "" };
  return { type: "copy", url: selectedRow.githubUrl ?? "" };
}
