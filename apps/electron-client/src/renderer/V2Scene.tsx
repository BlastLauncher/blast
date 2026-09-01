import { useState } from "react";

import type { SceneFormValue, SceneFormValues, SceneNode, ScenePropValue, SceneShortcut } from "@blastlauncher/scene";

import { Detail } from "./components/Detail";
import { normalizeV2SceneColor, selectV2SceneImageSource, V2SceneIcon } from "./V2SceneIcon";

export type V2SceneEventSender = (eventId: string, values?: SceneFormValues) => Promise<void>;

export interface V2SceneProps {
  readonly root: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}

export function V2Scene({ root, disabled, onEvent }: V2SceneProps): React.JSX.Element {
  switch (root.type) {
    case "list":
      return <ListScene disabled={disabled} onEvent={onEvent} root={root} />;
    case "grid":
      return <GridScene disabled={disabled} onEvent={onEvent} root={root} />;
    case "detail":
      return <DetailScene disabled={disabled} onEvent={onEvent} root={root} />;
    case "form":
      return <FormScene disabled={disabled} onEvent={onEvent} root={root} />;
    case "menu-bar-extra":
      return <MenuBarScene disabled={disabled} onEvent={onEvent} root={root} />;
    default:
      return <UnsupportedScene node={root} />;
  }
}

function ListScene({ root, disabled, onEvent }: V2SceneProps) {
  const remoteSearchText = stringProp(root, "searchText") ?? "";
  const [searchText, setSearchText] = useState(remoteSearchText);
  const searchEvent = stringProp(root, "onSearchTextChange");
  const selectionEvent = stringProp(root, "onSelectionChange");
  const filtering = booleanProp(root, "filtering") ?? searchEvent === undefined;
  const children = filterCollectionChildren(root.children, filtering ? searchText : "", "list-section", "list-item");

  const sendSearch = (value: string): void => {
    setSearchText(value);
    if (searchEvent !== undefined) {
      fireEvent(onEvent, searchEvent, { searchText: value });
    }
  };

  return (
    <CollectionLayout
      disabled={disabled}
      loading={booleanProp(root, "isLoading")}
      navigationTitle={stringProp(root, "navigationTitle")}
      onSearch={filtering || searchEvent !== undefined ? sendSearch : undefined}
      searchText={searchText}
      searchPlaceholder={stringProp(root, "searchBarPlaceholder")}
    >
      {children.map((child) => {
        if (child.type === "list-section") {
          return (
            <section className="flex flex-col gap-2" key={child.id}>
              {stringProp(child, "title") !== undefined && (
                <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-white/45">
                  {stringProp(child, "title")}
                </h2>
              )}
              {child.children.map((sectionChild) => (
                <ListChild
                  child={sectionChild}
                  disabled={disabled}
                  key={sectionChild.id}
                  onEvent={onEvent}
                  selectionEvent={selectionEvent}
                />
              ))}
            </section>
          );
        }
        return (
          <ListChild
            child={child}
            disabled={disabled}
            key={child.id}
            onEvent={onEvent}
            selectionEvent={selectionEvent}
          />
        );
      })}
      <PaginationControl disabled={disabled} node={root} onEvent={onEvent} />
    </CollectionLayout>
  );
}

function GridScene({ root, disabled, onEvent }: V2SceneProps) {
  const remoteSearchText = stringProp(root, "searchText") ?? "";
  const [searchText, setSearchText] = useState(remoteSearchText);
  const searchEvent = stringProp(root, "onSearchTextChange");
  const selectionEvent = stringProp(root, "onSelectionChange");
  const columns = Math.max(1, Math.min(8, numberProp(root, "columns") ?? 3));
  const filtering = booleanProp(root, "filtering") ?? searchEvent === undefined;
  const children = filterCollectionChildren(root.children, filtering ? searchText : "", "grid-section", "grid-item");

  const sendSearch = (value: string): void => {
    setSearchText(value);
    if (searchEvent !== undefined) {
      fireEvent(onEvent, searchEvent, { searchText: value });
    }
  };

  return (
    <CollectionLayout
      disabled={disabled}
      grid
      loading={booleanProp(root, "isLoading")}
      navigationTitle={stringProp(root, "navigationTitle")}
      onSearch={filtering || searchEvent !== undefined ? sendSearch : undefined}
      searchText={searchText}
      searchPlaceholder={stringProp(root, "searchBarPlaceholder")}
    >
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {children.map((child) => {
          if (child.type === "grid-section") {
            return (
              <section className="col-span-full flex flex-col gap-2" key={child.id}>
                {stringProp(child, "title") !== undefined && (
                  <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-white/45">
                    {stringProp(child, "title")}
                  </h2>
                )}
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                  {child.children.map((sectionChild) => (
                    <GridChild
                      child={sectionChild}
                      disabled={disabled}
                      key={sectionChild.id}
                      onEvent={onEvent}
                      selectionEvent={selectionEvent}
                    />
                  ))}
                </div>
              </section>
            );
          }
          return (
            <GridChild
              child={child}
              disabled={disabled}
              key={child.id}
              onEvent={onEvent}
              selectionEvent={selectionEvent}
            />
          );
        })}
      </div>
      <PaginationControl disabled={disabled} node={root} onEvent={onEvent} />
    </CollectionLayout>
  );
}

function filterCollectionChildren(
  children: readonly SceneNode[],
  searchText: string,
  sectionType: "list-section" | "grid-section",
  itemType: "list-item" | "grid-item",
): readonly SceneNode[] {
  const query = searchText.trim().toLowerCase();
  if (query.length === 0) {
    return children;
  }

  return children.flatMap((child) => {
    if (child.type === sectionType) {
      const sectionItems = child.children.filter((sectionChild) => sectionChild.type === itemType);
      if (sectionItems.length === 0) {
        return [child];
      }
      const visibleChildren = child.children.filter(
        (sectionChild) => sectionChild.type !== itemType || matchesCollectionItem(sectionChild, query),
      );
      return visibleChildren.some((sectionChild) => sectionChild.type === itemType)
        ? [{ ...child, children: visibleChildren }]
        : [];
    }
    if (child.type === itemType) {
      return matchesCollectionItem(child, query) ? [child] : [];
    }
    return [child];
  });
}

function matchesCollectionItem(item: SceneNode, query: string): boolean {
  const searchable = [stringProp(item, "title"), ...(stringArrayProp(item, "keywords") ?? [])]
    .filter((value): value is string => value !== undefined)
    .join("\n")
    .toLowerCase();
  return searchable.includes(query);
}

function MenuBarScene({ root, disabled, onEvent }: V2SceneProps): React.JSX.Element {
  const loading = booleanProp(root, "isLoading");
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-3">
      <header className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
        <V2SceneIcon node={root} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{stringProp(root, "title") ?? "Menu Bar"}</h1>
          {stringProp(root, "tooltip") !== undefined && (
            <p className="truncate text-xs text-white/50">{stringProp(root, "tooltip")}</p>
          )}
        </div>
        {loading && <span className="text-xs text-white/45">Loading…</span>}
      </header>
      <div className="rounded-lg border border-white/10 bg-black/10 p-2">
        <MenuBarNodes disabled={disabled || loading === true} nodes={root.children} onEvent={onEvent} />
      </div>
    </section>
  );
}

function MenuBarNodes({
  nodes,
  disabled,
  onEvent,
}: {
  readonly nodes: readonly SceneNode[];
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((node) => (
        <MenuBarNode disabled={disabled} key={node.id} node={node} onEvent={onEvent} />
      ))}
    </div>
  );
}

function MenuBarNode({
  node,
  disabled,
  onEvent,
}: {
  readonly node: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}): React.JSX.Element | null {
  switch (node.type) {
    case "menu-bar-item":
      return <MenuBarItem disabled={disabled} node={node} onEvent={onEvent} />;
    case "menu-bar-section":
      return (
        <section className="flex flex-col gap-1 px-1 py-2 first:pt-0 last:pb-0" key={node.id}>
          {stringProp(node, "title") !== undefined && (
            <h2 className="px-2 pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-white/45">
              {stringProp(node, "title")}
            </h2>
          )}
          <MenuBarNodes disabled={disabled} nodes={node.children} onEvent={onEvent} />
        </section>
      );
    case "menu-bar-submenu":
      return (
        <details className="group" onClick={(event) => disabled && event.preventDefault()}>
          <summary
            aria-disabled={disabled}
            className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-white/10 [&::-webkit-details-marker]:hidden"
          >
            <V2SceneIcon node={node} />
            <span className="min-w-0 flex-1 truncate">{stringProp(node, "title") ?? "More"}</span>
            <span className="text-xs text-white/40 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="ml-3 border-l border-white/10 pl-2">
            <MenuBarNodes disabled={disabled} nodes={node.children} onEvent={onEvent} />
          </div>
        </details>
      );
    case "menu-bar-separator":
      return <hr className="my-1 border-white/10" />;
    default:
      return null;
  }
}

function MenuBarItem({
  node,
  disabled,
  onEvent,
}: {
  readonly node: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}): React.JSX.Element {
  const actionEvent = stringProp(node, "onAction");
  const alternate = node.children.find(
    (child) => child.type === "menu-bar-item" && booleanProp(child, "isAlternate") === true,
  );
  const alternateEvent = alternate === undefined ? undefined : stringProp(alternate, "onAction");
  const shortcut = shortcutProp(node, "shortcut");

  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled || actionEvent === undefined}
      onClick={() => (actionEvent === undefined ? undefined : fireEvent(onEvent, actionEvent, { type: "left-click" }))}
      onContextMenu={(event) => {
        if (disabled || alternateEvent === undefined) {
          return;
        }
        event.preventDefault();
        fireEvent(onEvent, alternateEvent, { type: "right-click" });
      }}
      title={stringProp(node, "tooltip")}
      type="button"
    >
      <V2SceneIcon node={node} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{stringProp(node, "title") ?? node.id}</span>
        {stringProp(node, "subtitle") !== undefined && (
          <span className="block truncate text-xs text-white/50">{stringProp(node, "subtitle")}</span>
        )}
        {alternate !== undefined && (
          <span className="block truncate text-[0.65rem] text-white/35">
            Right-click: {stringProp(alternate, "title") ?? "alternate action"}
          </span>
        )}
      </span>
      {shortcut !== undefined && <kbd className="shrink-0 text-xs text-white/45">{shortcut}</kbd>}
    </button>
  );
}

function CollectionLayout({
  children,
  disabled,
  grid = false,
  loading,
  navigationTitle,
  onSearch,
  searchText,
  searchPlaceholder,
}: {
  readonly children: React.ReactNode;
  readonly disabled: boolean;
  readonly grid?: boolean;
  readonly loading?: boolean;
  readonly navigationTitle?: string;
  readonly onSearch?: (value: string) => void;
  readonly searchText: string;
  readonly searchPlaceholder?: string;
}): React.JSX.Element {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{navigationTitle ?? (grid ? "Grid" : "List")}</h1>
          {loading && <p className="text-xs text-white/45">Loading…</p>}
        </div>
      </div>
      {onSearch !== undefined && (
        <input
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          disabled={disabled}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchPlaceholder ?? "Search…"}
          value={searchText}
        />
      )}
      <div className="flex min-h-0 flex-col gap-2">{children}</div>
    </section>
  );
}

function ListChild({
  child,
  disabled,
  onEvent,
  selectionEvent,
}: {
  readonly child: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly selectionEvent?: string;
}): React.JSX.Element | null {
  switch (child.type) {
    case "list-item":
      return (
        <CollectionItem
          disabled={disabled}
          item={child}
          onEvent={onEvent}
          selectionEvent={selectionEvent}
          variant="list"
        />
      );
    case "list-dropdown":
    case "grid-dropdown":
      return <SceneDropdown disabled={disabled} node={child} onEvent={onEvent} />;
    case "list-empty-view":
      return <EmptyView disabled={disabled} node={child} onEvent={onEvent} />;
    case "action-group":
      return <ActionButtons disabled={disabled} nodes={[child]} onEvent={onEvent} />;
    default:
      return null;
  }
}

function GridChild({
  child,
  disabled,
  onEvent,
  selectionEvent,
}: {
  readonly child: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly selectionEvent?: string;
}): React.JSX.Element | null {
  switch (child.type) {
    case "grid-item":
      return (
        <CollectionItem
          disabled={disabled}
          item={child}
          onEvent={onEvent}
          selectionEvent={selectionEvent}
          variant="grid"
        />
      );
    case "grid-dropdown":
    case "list-dropdown":
      return (
        <div className="col-span-full">
          <SceneDropdown disabled={disabled} node={child} onEvent={onEvent} />
        </div>
      );
    case "grid-empty-view":
      return (
        <div className="col-span-full">
          <EmptyView disabled={disabled} node={child} onEvent={onEvent} />
        </div>
      );
    case "action-group":
      return (
        <div className="col-span-full">
          <ActionButtons disabled={disabled} nodes={[child]} onEvent={onEvent} />
        </div>
      );
    default:
      return null;
  }
}

function CollectionItem({
  item,
  disabled,
  onEvent,
  selectionEvent,
  variant,
}: {
  readonly item: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly selectionEvent?: string;
  readonly variant: "list" | "grid";
}): React.JSX.Element {
  const itemId = stringProp(item, "id") ?? item.id;
  const primaryAction = firstAction(item.children);
  const select = (): void => {
    if (selectionEvent !== undefined) {
      fireEvent(onEvent, selectionEvent, { selectedItemId: itemId });
    }
    const actionEvent = primaryAction === undefined ? undefined : stringProp(primaryAction, "onAction");
    if (actionEvent !== undefined) {
      fireEvent(onEvent, actionEvent);
    }
  };

  return (
    <article className={`rounded-lg border border-white/10 bg-white/5 p-3 ${variant === "grid" ? "min-h-28" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          className="min-w-0 flex-1 text-left hover:text-blue-100 disabled:opacity-50"
          disabled={disabled}
          onClick={select}
          type="button"
        >
          <span className="flex items-start gap-3">
            <V2SceneIcon kind={variant === "grid" ? "content" : "icon"} node={item} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{stringProp(item, "title") ?? item.id}</span>
              {stringProp(item, "subtitle") !== undefined && (
                <span className="mt-1 block truncate text-xs text-white/50">{stringProp(item, "subtitle")}</span>
              )}
            </span>
          </span>
        </button>
        <CollectionAccessories item={item} variant={variant} />
      </div>
      <ActionButtons disabled={disabled} nodes={item.children} onEvent={onEvent} />
    </article>
  );
}

function CollectionAccessories({
  item,
  variant,
}: {
  readonly item: SceneNode;
  readonly variant: "list" | "grid";
}): React.JSX.Element | null {
  const iconSource = selectV2SceneImageSource(item, "accessory");
  const title = stringProp(item, "accessoryTitle");
  const tooltip = stringProp(item, "accessoryTooltip");
  const accessories = variant === "list" ? parseListAccessories(item) : [];
  if (iconSource === undefined && title === undefined && accessories.length === 0) {
    return null;
  }

  return (
    <aside className="flex max-w-[45%] shrink-0 flex-wrap items-center justify-end gap-1 text-xs text-white/55">
      {iconSource !== undefined && (
        <span title={tooltip}>
          <V2SceneIcon kind="accessory" node={item} size="small" />
        </span>
      )}
      {title !== undefined && (
        <span className="max-w-32 truncate" title={title}>
          {title}
        </span>
      )}
      {accessories.map((accessory, index) => (
        <CollectionAccessory
          key={`${item.id}-accessory-${index}`}
          parentId={item.id}
          accessory={accessory}
          index={index}
        />
      ))}
    </aside>
  );
}

interface ParsedListAccessory {
  readonly text?: string;
  readonly date?: string;
  readonly tag?: string;
  readonly textColor?: string;
  readonly dateColor?: string;
  readonly tagColor?: string;
  readonly tooltip?: string;
  readonly icon?: string;
  readonly iconDark?: string;
  readonly iconFallback?: string;
  readonly iconFallbackDark?: string;
  readonly iconMask?: string;
  readonly iconTintColor?: string;
  readonly iconTintColorDark?: string;
  readonly iconTintColorAdjustContrast?: boolean;
}

function CollectionAccessory({
  accessory,
  index,
  parentId,
}: {
  readonly accessory: ParsedListAccessory;
  readonly index: number;
  readonly parentId: string;
}): React.JSX.Element | null {
  const values = [
    ["text", accessory.text, accessory.textColor],
    ["date", accessory.date, accessory.dateColor],
    ["tag", accessory.tag, accessory.tagColor],
  ].filter(([, value]) => value !== undefined) as Array<[string, string, string | undefined]>;
  const iconNode = accessoryIconNode(parentId, index, accessory);
  const iconSource = selectV2SceneImageSource(iconNode, "accessory");
  if (values.length === 0 && iconSource === undefined) {
    return null;
  }

  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded bg-white/10 px-1.5 py-0.5"
      title={accessory.tooltip}
    >
      {iconSource !== undefined && <V2SceneIcon kind="accessory" node={iconNode} size="small" />}
      {values.map(([kind, value, color]) => (
        <span data-accessory-kind={kind} key={kind} style={safeColorStyle(color)}>
          {value}
        </span>
      ))}
    </span>
  );
}

function parseListAccessories(node: SceneNode): readonly ParsedListAccessory[] {
  const serialized = stringProp(node, "accessories");
  if (serialized === undefined) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      return [parseListAccessory(entry)];
    });
  } catch {
    return [];
  }
}

function parseListAccessory(value: Record<string, unknown>): ParsedListAccessory {
  return {
    ...optionalString(value.text, "text"),
    ...optionalString(value.date, "date"),
    ...optionalString(value.tag, "tag"),
    ...optionalString(value.textColor, "textColor"),
    ...optionalString(value.dateColor, "dateColor"),
    ...optionalString(value.tagColor, "tagColor"),
    ...optionalString(value.tooltip, "tooltip"),
    ...optionalString(value.icon, "icon"),
    ...optionalString(value.iconDark, "iconDark"),
    ...optionalString(value.iconFallback, "iconFallback"),
    ...optionalString(value.iconFallbackDark, "iconFallbackDark"),
    ...optionalString(value.iconMask, "iconMask"),
    ...optionalString(value.iconTintColor, "iconTintColor"),
    ...optionalString(value.iconTintColorDark, "iconTintColorDark"),
    ...(typeof value.iconTintColorAdjustContrast === "boolean"
      ? { iconTintColorAdjustContrast: value.iconTintColorAdjustContrast }
      : {}),
  };
}

function accessoryIconNode(parentId: string, index: number, accessory: ParsedListAccessory): SceneNode {
  return {
    id: `${parentId}-accessory-${index}`,
    type: "list-item",
    props: {
      ...(accessory.icon === undefined ? {} : { accessoryIcon: accessory.icon }),
      ...(accessory.iconDark === undefined ? {} : { accessoryIconDark: accessory.iconDark }),
      ...(accessory.iconFallback === undefined ? {} : { accessoryIconFallback: accessory.iconFallback }),
      ...(accessory.iconFallbackDark === undefined ? {} : { accessoryIconFallbackDark: accessory.iconFallbackDark }),
      ...(accessory.iconMask === undefined ? {} : { accessoryIconMask: accessory.iconMask }),
      ...(accessory.iconTintColor === undefined ? {} : { accessoryIconTintColor: accessory.iconTintColor }),
      ...(accessory.iconTintColorDark === undefined ? {} : { accessoryIconTintColorDark: accessory.iconTintColorDark }),
      ...(accessory.iconTintColorAdjustContrast === undefined
        ? {}
        : { accessoryIconTintColorAdjustContrast: accessory.iconTintColorAdjustContrast }),
    },
    children: [],
  };
}

function optionalString(value: unknown, key: string): Record<string, string> {
  return typeof value === "string" ? { [key]: value } : {};
}

function safeColorStyle(value: string | undefined): React.CSSProperties | undefined {
  const color = value === undefined ? undefined : normalizeV2SceneColor(value);
  return color === undefined ? undefined : { color };
}

function SceneDropdown({
  node,
  disabled,
  onEvent,
}: {
  readonly node: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}): React.JSX.Element {
  const currentValue = stringProp(node, "value") ?? stringProp(node, "defaultValue") ?? "";
  const eventId = stringProp(node, "onChange");
  const fieldId = stringProp(node, "id");

  return (
    <select
      className="max-w-48 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs outline-none disabled:opacity-50"
      disabled={disabled || booleanProp(node, "isLoading")}
      onChange={(event) => {
        if (eventId === undefined) {
          return;
        }
        const value = event.target.value;
        fireEvent(onEvent, eventId, fieldId === undefined ? { value } : { value, [fieldId]: value });
      }}
      value={currentValue}
    >
      {dropdownOptions(node)}
    </select>
  );
}

function PaginationControl({
  node,
  disabled,
  onEvent,
}: {
  readonly node: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}): React.JSX.Element | null {
  const eventId = stringProp(node, "onLoadMore");
  if (eventId === undefined) {
    return null;
  }
  return (
    <button
      className="self-center rounded-md bg-white/10 px-3 py-2 text-xs hover:bg-white/20 disabled:opacity-50"
      disabled={disabled || booleanProp(node, "isLoading") || booleanProp(node, "paginationHasMore") === false}
      onClick={() => fireEvent(onEvent, eventId)}
      type="button"
    >
      Load more
    </button>
  );
}

function EmptyView({
  node,
  disabled,
  onEvent,
}: {
  readonly node: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center">
      <V2SceneIcon node={node} />
      <div className="mt-2 text-sm font-medium">{stringProp(node, "title") ?? "Nothing here"}</div>
      {stringProp(node, "description") !== undefined && (
        <div className="mt-1 text-xs text-white/50">{stringProp(node, "description")}</div>
      )}
      <ActionButtons disabled={disabled} nodes={node.children} onEvent={onEvent} />
    </div>
  );
}

function DetailScene({ root, disabled, onEvent }: V2SceneProps) {
  const markdown = stringProp(root, "markdown") ?? "";
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4">
      {stringProp(root, "navigationTitle") !== undefined && (
        <h1 className="text-lg font-semibold">{stringProp(root, "navigationTitle")}</h1>
      )}
      <div className="min-h-0 rounded-lg border border-white/10 bg-white/5 p-4">
        <Detail markdown={markdown} />
        {root.children
          .filter((child) => child.type === "detail-metadata")
          .map((child) => (
            <DetailMetadata key={child.id} node={child} />
          ))}
      </div>
      <ActionButtons disabled={disabled} nodes={root.children} onEvent={onEvent} />
    </section>
  );
}

function DetailMetadata({ node }: { readonly node: SceneNode }): React.JSX.Element {
  return (
    <div className="mt-4 grid gap-2 border-t border-white/10 pt-3 text-xs">
      {node.children.map((child) => {
        switch (child.type) {
          case "detail-metadata-label":
            return (
              <div className="flex gap-3" key={child.id}>
                <span className="w-28 shrink-0 text-white/45">{stringProp(child, "title")}</span>
                <span>{stringProp(child, "text") ?? ""}</span>
              </div>
            );
          case "detail-metadata-separator":
            return <hr className="border-white/10" key={child.id} />;
          case "detail-metadata-link":
            return (
              <div className="flex gap-3" key={child.id}>
                <span className="w-28 shrink-0 text-white/45">{stringProp(child, "title")}</span>
                <span className="truncate text-blue-200">
                  {stringProp(child, "text") ?? stringProp(child, "target")}
                </span>
              </div>
            );
          case "detail-metadata-tag-list":
            return (
              <div className="flex gap-3" key={child.id}>
                <span className="w-28 shrink-0 text-white/45">{stringProp(child, "title")}</span>
                <span className="flex flex-wrap gap-1">
                  {child.children.map((tag) => (
                    <span className="rounded bg-white/10 px-1.5 py-0.5" key={tag.id}>
                      {stringProp(tag, "text") ?? ""}
                    </span>
                  ))}
                </span>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

function FormScene({ root, disabled, onEvent }: V2SceneProps) {
  const fields = root.children.filter(isFormField);
  const [values, setValues] = useState<SceneFormValues>(() => initialFormValues(fields));

  const updateField = (field: SceneNode, value: SceneFormValue): void => {
    const id = stringProp(field, "id");
    if (id === undefined) {
      return;
    }
    const nextValues = { ...values, [id]: value };
    setValues(nextValues);
    const eventId = stringProp(field, "onChange");
    if (eventId !== undefined) {
      fireEvent(onEvent, eventId, nextValues);
    }
  };

  const sendFieldFocus = (field: SceneNode, property: "onFocus" | "onBlur"): void => {
    const eventId = stringProp(field, property);
    if (eventId !== undefined) {
      fireEvent(onEvent, eventId, values);
    }
  };

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      {stringProp(root, "navigationTitle") !== undefined && (
        <h1 className="text-lg font-semibold">{stringProp(root, "navigationTitle")}</h1>
      )}
      {booleanProp(root, "isLoading") && <div className="text-xs text-white/45">Loading…</div>}
      <div className="flex flex-col gap-3">
        {root.children.map((child) => {
          if (isFormField(child)) {
            return (
              <FormField
                disabled={disabled || booleanProp(root, "isLoading")}
                field={child}
                key={child.id}
                onBlur={() => sendFieldFocus(child, "onBlur")}
                onChange={(value) => updateField(child, value)}
                onFocus={() => sendFieldFocus(child, "onFocus")}
                value={values[stringProp(child, "id") ?? ""]}
              />
            );
          }
          if (child.type === "form-description") {
            return (
              <div className="text-xs text-white/55" key={child.id}>
                {stringProp(child, "title") !== undefined && (
                  <div className="font-medium">{stringProp(child, "title")}</div>
                )}
                <div>{stringProp(child, "text")}</div>
              </div>
            );
          }
          if (child.type === "form-separator") {
            return <hr className="border-white/10" key={child.id} />;
          }
          if (child.type === "form-link-accessory") {
            const eventId = stringProp(child, "onOpen");
            return (
              <button
                className="self-start rounded-md bg-white/10 px-3 py-2 text-xs hover:bg-white/20 disabled:opacity-50"
                disabled={disabled || eventId === undefined}
                key={child.id}
                onClick={() => (eventId === undefined ? undefined : fireEvent(onEvent, eventId))}
                type="button"
              >
                {stringProp(child, "text") ?? stringProp(child, "target") ?? "Open link"}
              </button>
            );
          }
          return null;
        })}
      </div>
      <ActionButtons disabled={disabled} nodes={root.children} onEvent={onEvent} values={values} />
    </section>
  );
}

function FormField({
  field,
  value,
  disabled,
  onChange,
  onFocus,
  onBlur,
}: {
  readonly field: SceneNode;
  readonly value: SceneFormValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: SceneFormValue) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}): React.JSX.Element | null {
  const id = stringProp(field, "id") ?? field.id;
  const title = stringProp(field, "title") ?? stringProp(field, "label") ?? id;
  const info = stringProp(field, "info");
  const error = stringProp(field, "error");
  const common = { disabled, onBlur, onFocus };

  let control: React.ReactNode;
  switch (field.type) {
    case "form-text-field":
    case "form-password-field":
      control = (
        <input
          {...common}
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          onChange={(event) => onChange(event.target.value)}
          placeholder={stringProp(field, "placeholder")}
          type={field.type === "form-password-field" ? "password" : "text"}
          value={
            typeof value === "string" ? value : (stringProp(field, "value") ?? stringProp(field, "defaultValue") ?? "")
          }
        />
      );
      break;
    case "form-text-area":
      control = (
        <textarea
          {...common}
          className="min-h-24 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          onChange={(event) => onChange(event.target.value)}
          placeholder={stringProp(field, "placeholder")}
          value={
            typeof value === "string" ? value : (stringProp(field, "value") ?? stringProp(field, "defaultValue") ?? "")
          }
        />
      );
      break;
    case "form-checkbox":
      control = (
        <label className="flex items-center gap-2 text-sm">
          <input
            {...common}
            checked={
              typeof value === "boolean"
                ? value
                : (booleanProp(field, "value") ?? booleanProp(field, "defaultValue") ?? false)
            }
            onChange={(event) => onChange(event.target.checked)}
            type="checkbox"
          />
          <span>{stringProp(field, "label") ?? title}</span>
        </label>
      );
      break;
    case "form-dropdown":
      control = (
        <select
          {...common}
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          onChange={(event) => onChange(event.target.value)}
          value={
            typeof value === "string" ? value : (stringProp(field, "value") ?? stringProp(field, "defaultValue") ?? "")
          }
        >
          {dropdownOptions(field)}
        </select>
      );
      break;
    case "form-date-picker":
      {
        const datePickerType = stringProp(field, "type") === "date" ? "date" : "date_time";
        const sourceValue =
          value === null
            ? undefined
            : typeof value === "string"
              ? value
              : (stringProp(field, "value") ?? stringProp(field, "defaultValue"));
        const inputValue = formatV2DatePickerValue(sourceValue, datePickerType);
        const min = formatV2DatePickerValue(stringProp(field, "min"), datePickerType);
        const max = formatV2DatePickerValue(stringProp(field, "max"), datePickerType);
        control = (
          <input
            {...common}
            autoFocus={booleanProp(field, "autoFocus")}
            className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
            max={max === "" ? undefined : max}
            min={min === "" ? undefined : min}
            onChange={(event) => onChange(serializeV2DatePickerValue(event.target.value, datePickerType))}
            step={datePickerType === "date_time" ? 0.001 : undefined}
            type={datePickerType === "date" ? "date" : "datetime-local"}
            value={inputValue}
          />
        );
      }
      break;
    case "form-tag-picker":
    case "form-file-picker":
      control = (
        <input
          {...common}
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          onChange={(event) => onChange(splitList(event.target.value))}
          placeholder="Comma-separated values"
          value={Array.isArray(value) ? value.join(", ") : (stringArrayProp(field, "value")?.join(", ") ?? "")}
        />
      );
      break;
    default:
      return null;
  }

  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-white/75">{title}</span>
      {control}
      {info !== undefined && <span className="text-white/45">{info}</span>}
      {error !== undefined && <span className="text-red-200">{error}</span>}
    </label>
  );
}

function ActionButtons({
  nodes,
  disabled,
  onEvent,
  values,
}: {
  readonly nodes: readonly SceneNode[];
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly values?: SceneFormValues;
}): React.JSX.Element | null {
  const actions = nodes.filter((node) => node.type === "action");
  const groups = nodes.filter((node) => node.type === "action-group");
  if (actions.length === 0 && groups.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <ActionButton action={action} disabled={disabled} key={action.id} onEvent={onEvent} values={values} />
      ))}
      {groups.map((group) => (
        <ActionGroup disabled={disabled} group={group} key={group.id} onEvent={onEvent} values={values} />
      ))}
    </div>
  );
}

function ActionGroup({
  group,
  disabled,
  onEvent,
  values,
}: {
  readonly group: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly values?: SceneFormValues;
}): React.JSX.Element {
  if (booleanProp(group, "isSubmenu") === true) {
    return <ActionSubmenu disabled={disabled} group={group} onEvent={onEvent} values={values} />;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stringProp(group, "title") !== undefined && (
        <span className="mr-1 text-xs text-white/45">{stringProp(group, "title")}</span>
      )}
      <ActionButtons disabled={disabled} nodes={group.children} onEvent={onEvent} values={values} />
    </div>
  );
}

function ActionSubmenu({
  group,
  disabled,
  onEvent,
  values,
}: {
  readonly group: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly values?: SceneFormValues;
}): React.JSX.Element {
  const autoFocus = booleanProp(group, "autoFocus") === true;
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchEvent = stringProp(group, "onSearchTextChange");
  const filtering = booleanProp(group, "filtering") ?? searchEvent === undefined;
  const visibleChildren = filterV2SceneActionChildren(group.children, filtering ? searchText : "");
  const title = stringProp(group, "title") ?? "More actions";
  const iconSource = selectV2SceneImageSource(group);
  const openEvent = stringProp(group, "onOpen");

  const toggle = (event: React.SyntheticEvent<HTMLDetailsElement>): void => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen && openEvent !== undefined) {
      fireEvent(onEvent, openEvent);
    }
  };
  const search = (value: string): void => {
    setSearchText(value);
    if (searchEvent !== undefined) {
      fireEvent(onEvent, searchEvent, { searchText: value });
    }
  };

  return (
    <details
      className="min-w-40 rounded-md border border-white/10 bg-white/5"
      data-action-submenu="true"
      data-action-submenu-loading={booleanProp(group, "isLoading") ? "true" : undefined}
      data-action-submenu-open={open ? "true" : "false"}
      open={open}
      onToggle={toggle}
    >
      <summary
        aria-busy={booleanProp(group, "isLoading")}
        autoFocus={autoFocus}
        className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs text-white/80 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-300/60"
      >
        {iconSource !== undefined && <V2SceneIcon node={group} size="small" />}
        <span className="truncate">{title}</span>
        {booleanProp(group, "isLoading") && <span className="text-white/45">Loading…</span>}
        {shortcutProp(group, "shortcut") !== undefined && (
          <kbd className="ml-1 text-white/45">{shortcutProp(group, "shortcut")}</kbd>
        )}
      </summary>
      {(filtering || searchEvent !== undefined) && (
        <div className="border-t border-white/10 p-2">
          <input
            aria-label={`${title} search`}
            className="w-full rounded border border-white/10 bg-black/10 px-2 py-1 text-xs outline-none focus:border-blue-400/60"
            disabled={disabled || booleanProp(group, "isLoading")}
            onChange={(event) => search(event.target.value)}
            placeholder="Filter actions…"
            value={searchText}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-2">
        <ActionButtons
          disabled={disabled || booleanProp(group, "isLoading") === true}
          nodes={visibleChildren}
          onEvent={onEvent}
          values={values}
        />
      </div>
    </details>
  );
}

export function filterV2SceneActionChildren(nodes: readonly SceneNode[], query: string): readonly SceneNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return nodes;
  }
  return nodes.flatMap((node) => {
    if (node.type === "action") {
      return (stringProp(node, "title") ?? "").toLowerCase().includes(normalizedQuery) ? [node] : [];
    }
    if (node.type !== "action-group") {
      return [];
    }
    const titleMatches = (stringProp(node, "title") ?? "").toLowerCase().includes(normalizedQuery);
    if (titleMatches) {
      return [node];
    }
    const children = filterV2SceneActionChildren(node.children, normalizedQuery);
    return children.length === 0 ? [] : [{ ...node, children }];
  });
}

function ActionButton({
  action,
  disabled,
  onEvent,
  values,
}: {
  readonly action: SceneNode;
  readonly disabled: boolean;
  readonly onEvent: V2SceneEventSender;
  readonly values?: SceneFormValues;
}): React.JSX.Element {
  const eventId = stringProp(action, "onAction");
  const iconSource = selectV2SceneImageSource(action);
  const destructive = stringProp(action, "style") === "destructive";
  return (
    <button
      autoFocus={booleanProp(action, "autoFocus")}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs disabled:opacity-50 ${
        destructive
          ? "bg-red-400/20 text-red-100 hover:bg-red-400/30"
          : "bg-blue-400/20 text-blue-100 hover:bg-blue-400/30"
      }`}
      data-action-style={destructive ? "destructive" : "regular"}
      disabled={disabled || eventId === undefined}
      onClick={() => (eventId === undefined ? undefined : fireEvent(onEvent, eventId, values))}
      type="button"
    >
      {iconSource !== undefined && <V2SceneIcon node={action} size="small" />}
      {stringProp(action, "title") ?? "Run"}
      {shortcutProp(action, "shortcut") !== undefined && (
        <span className="ml-2 text-white/50">{shortcutProp(action, "shortcut")}</span>
      )}
    </button>
  );
}

function UnsupportedScene({ node }: { readonly node: SceneNode }): React.JSX.Element {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-5 text-sm text-amber-100">
      This V2 renderer does not yet display the `{node.type}` scene member.
    </div>
  );
}

function isFormField(node: SceneNode): boolean {
  return (
    node.type.startsWith("form-") && !["form-link-accessory", "form-description", "form-separator"].includes(node.type)
  );
}

function initialFormValues(fields: readonly SceneNode[]): SceneFormValues {
  const values: Record<string, SceneFormValue> = {};
  for (const field of fields) {
    const id = stringProp(field, "id");
    if (id === undefined) {
      continue;
    }
    const value = sceneFormValue(field.props.value) ?? sceneFormValue(field.props.defaultValue);
    if (value !== undefined) {
      values[id] = value;
    }
  }
  return values;
}

function firstAction(nodes: readonly SceneNode[]): SceneNode | undefined {
  for (const node of nodes) {
    if (node.type === "action") {
      return node;
    }
    if (node.type === "action-group") {
      const nested = firstAction(node.children);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function dropdownOptions(node: SceneNode): React.ReactNode[] {
  return node.children.flatMap((child) => {
    if (child.type.endsWith("dropdown-item")) {
      return [
        <option key={child.id} value={stringProp(child, "value") ?? ""}>
          {stringProp(child, "title") ?? stringProp(child, "value") ?? ""}
        </option>,
      ];
    }
    if (child.type.endsWith("dropdown-section")) {
      return [
        <optgroup key={child.id} label={stringProp(child, "title") ?? ""}>
          {child.children
            .filter((sectionChild) => sectionChild.type.endsWith("dropdown-item"))
            .map((option) => (
              <option key={option.id} value={stringProp(option, "value") ?? ""}>
                {stringProp(option, "title") ?? stringProp(option, "value") ?? ""}
              </option>
            ))}
        </optgroup>,
      ];
    }
    return [];
  });
}

function fireEvent(onEvent: V2SceneEventSender, eventId: string, values?: SceneFormValues): void {
  void onEvent(eventId, values).catch(() => {});
}

function sceneFormValue(value: ScenePropValue | undefined): SceneFormValue | undefined {
  if (typeof value === "string" || typeof value === "boolean" || Array.isArray(value)) {
    return value;
  }
  return undefined;
}

export type V2DatePickerType = "date" | "date_time";

export function formatV2DatePickerValue(value: string | undefined, type: V2DatePickerType): string {
  if (value === undefined || !isValidV2DateWireValue(value)) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (type === "date") {
    return `${year}-${month}-${day}`;
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();
  if (seconds === 0 && milliseconds === 0) {
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  const secondValue = String(seconds).padStart(2, "0");
  const millisecondValue = milliseconds === 0 ? "" : `.${String(milliseconds).padStart(3, "0")}`;
  return `${year}-${month}-${day}T${hours}:${minutes}:${secondValue}${millisecondValue}`;
}

export function serializeV2DatePickerValue(value: string, type: V2DatePickerType): string | null {
  if (value === "") {
    return null;
  }
  const pattern =
    type === "date"
      ? /^(\d{4})-(\d{2})-(\d{2})$/
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
  const match = pattern.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = type === "date_time" ? Number(match[4]) : 0;
  const minute = type === "date_time" ? Number(match[5]) : 0;
  const second = type === "date_time" && match[6] !== undefined ? Number(match[6]) : 0;
  const millisecond = type === "date_time" && match[7] !== undefined ? Number(match[7].padEnd(3, "0")) : 0;
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second ||
    date.getMilliseconds() !== millisecond
  ) {
    return null;
  }
  return date.toISOString();
}

function isValidV2DateWireValue(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day <= daysInMonth;
}

function stringProp(node: SceneNode, name: string): string | undefined {
  const value = node.props[name];
  return typeof value === "string" ? value : undefined;
}

function stringArrayProp(node: SceneNode, name: string): readonly string[] | undefined {
  const value = node.props[name];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function shortcutProp(node: SceneNode, name: string): string | undefined {
  const value = node.props[name];
  if (typeof value === "string") {
    return value;
  }
  if (!isSceneShortcut(value)) {
    return undefined;
  }
  return [...value.modifiers, value.key].join(" + ");
}

function isSceneShortcut(value: ScenePropValue | undefined): value is SceneShortcut {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as SceneShortcut;
  return (
    Array.isArray(candidate.modifiers) &&
    candidate.modifiers.every((modifier: unknown): modifier is string => typeof modifier === "string") &&
    typeof candidate.key === "string"
  );
}

function booleanProp(node: SceneNode, name: string): boolean | undefined {
  const value = node.props[name];
  return typeof value === "boolean" ? value : undefined;
}

function numberProp(node: SceneNode, name: string): number | undefined {
  const value = node.props[name];
  return typeof value === "number" ? value : undefined;
}

function splitList(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
