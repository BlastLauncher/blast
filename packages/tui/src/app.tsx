/** @jsxImportSource @opentui/react */
import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import {
  event,
  handler,
  handlerEvent,
  paginationOf,
  sceneToView,
  selectionId,
  text,
  actionRows,
  matchesShortcut,
} from "./view.ts";
import { gridMove } from "./grid.ts";
import { GridView } from "./grid.tsx";
import { dropdownLabel, dropdownOptions, filterOptions } from "./dropdown.ts";
import { DropdownPanel } from "./dropdown.tsx";
import { menuRows, MenuBarView } from "./menu-bar.tsx";

import { FormView } from "./form.tsx";

export function App({
  session,
  onQuit,
  onExit,
  hudDurationMs = 2500,
}: {
  session: Session;
  onQuit: () => void;
  /** Ctrl-C, which quits the whole TUI even when a picker owns the session. */
  onExit?: () => void;
  hudDurationMs?: number;
}) {
  const [scene, setScene] = useState<SceneMessage | undefined>(session.latestScene);
  const [panel, setPanel] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [actionIndex, setActionIndex] = useState(0);
  const [hudVisible, setHudVisible] = useState(false);
  const [searchText, setSearch] = useState("");
  const currentSearch = useRef("");
  const [selectedId, setSelected] = useState<string | null>(null);
  const [menuPath, setMenuPath] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [settled, setSettled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownQuery, setDropdownQuery] = useState("");
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const scroll = useRef<ScrollBoxRenderable>(null);
  const actionScroll = useRef<ScrollBoxRenderable>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSearch = useRef<string | undefined>(undefined);
  const previous = useRef<string | null | undefined>(undefined);
  const quitRequested = useRef(false);
  const paginatedFor = useRef(-1);
  const onQuitRef = useRef(onQuit);
  onQuitRef.current = onQuit;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const requestQuit = () => {
    if (quitRequested.current) return;
    quitRequested.current = true;
    onQuitRef.current();
  };
  const view = sceneToView(scene, { searchText, selectedId });
  const isMenu = view.list?.type === "MenuBarExtra";
  const menu = isMenu ? menuRows(view.list, menuPath) : [];
  const menuItems = menu.filter((row) => row.item);
  const menuChoice = menuItems.find((row) => selectionId(row.node) === selectedId) ?? menuItems[0];
  const pagination = paginationOf(view.list);
  const dropdown = view.accessory;
  const dropdownChoices = filterOptions(dropdownOptions(dropdown), dropdownQuery);
  const dropdownChoice = dropdownChoices[Math.min(dropdownIndex, dropdownChoices.length - 1)];
  const closeDropdown = () => {
    setDropdownOpen(false);
    setDropdownQuery("");
    setDropdownIndex(0);
  };
  let panelNode = view.actions;
  for (const id of panel ?? [])
    panelNode = (
      panelNode?.type === "ActionPanel.Submenu"
        ? panelNode.children.flatMap((child) => actionRows(child))
        : actionRows(panelNode)
    ).find((row) => row.node.id === id)?.node;
  const panelRows =
    panelNode?.type === "ActionPanel.Submenu"
      ? panelNode.children.flatMap((child) => actionRows(child, query))
      : actionRows(panelNode, query);
  const panelItems = panelRows.filter((row) => row.item);
  const chosen = panelItems[Math.min(actionIndex, panelItems.length - 1)]?.node;
  useEffect(() => {
    actionScroll.current?.scrollChildIntoView(chosen?.id ?? "");
  }, [chosen?.id]);
  const feedback = view.navigation?.children ?? [];
  const alert = feedback.find((node) => node.type === "Alert");
  const toast = feedback.find((node) => node.type === "Toast");
  const hud = feedback.find((node) => node.type === "HUD");
  const request = useRef({ clear: "", pop: "" });
  const send = (value: ReturnType<typeof event>) => {
    if (value) session.sendEvent(value.node, value.handler, value.args);
  };
  useEffect(
    () =>
      session.scenes((next) => {
        setScene(next);
      }),
    [session],
  );
  useEffect(() => {
    const value = view.list?.props.searchText;
    if (value === pendingSearch.current) pendingSearch.current = undefined;
    if (typeof value === "string" && pendingSearch.current === undefined) {
      currentSearch.current = value;
      setSearch(value);
    }
  }, [view.list?.props.searchText]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    setPanel(null);
    setSelected(null);
    setMenuPath([]);
    setDropdownOpen(false);
    setDropdownQuery("");
    setDropdownIndex(0);
    paginatedFor.current = -1;
    const initial = text(view.list?.props.searchText);
    currentSearch.current = initial;
    pendingSearch.current = undefined;
    setSearch(initial);
    clearTimeout(timer.current);
  }, [view.list?.id]);
  useEffect(() => {
    const props = view.navigation?.props;
    if (!props) return;
    const clear = JSON.stringify(props.clearSearchBar) ?? "";
    const pop = JSON.stringify(props.popToRoot) ?? "";
    const options = props.popToRoot;
    if (
      (clear && clear !== request.current.clear) ||
      (pop !== request.current.pop &&
        options &&
        typeof options === "object" &&
        !Array.isArray(options) &&
        "clearSearchBar" in options &&
        options.clearSearchBar)
    ) {
      currentSearch.current = "";
      pendingSearch.current = undefined;
      clearTimeout(timer.current);
      setSearch("");
      send(event(view.list, "onSearchTextChange", [""]));
    }
    request.current = { clear, pop };
    if (props.closeMainWindow) requestQuit();
  }, [scene?.revision]);
  useEffect(() => {
    setHudVisible(!!hud);
    if (!hud) return;
    const timeout = setTimeout(() => setHudVisible(false), hudDurationMs);
    return () => clearTimeout(timeout);
  }, [hud?.id, hud?.props.title, hudDurationMs]);
  // A runtime that exits on its own is a no-view command: quit once the HUD
  // window has passed. A failed runtime shows the error and waits for Esc.
  useEffect(() => {
    let active = true;
    void session.exited.then((exit) => {
      if (!active) return;
      if (exit.error || exit.code !== 0)
        setFailure(exit.error ? String(exit.error) : `Runtime exited: ${exit.code ?? exit.signal}`);
      else if (!quitRequested.current) setSettled(true);
    });
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    if (!settled) return;
    const timeout = setTimeout(requestQuit, hud ? hudDurationMs : 0);
    return () => clearTimeout(timeout);
  }, [settled, hud, hudDurationMs]);
  const id = selectionId(view.selected);
  useEffect(() => {
    // A menu-bar command has no list selection; its own state drives rows.
    if (id === null) return;
    setSelected(id);
    scroll.current?.scrollChildIntoView(view.selected?.id ?? "");
    if (previous.current !== id) {
      previous.current = id;
      send(event(view.list, "onSelectionChange", [id]));
    }
  }, [id, scene?.revision]);
  useEffect(() => {
    if (!isMenu) return;
    scroll.current?.scrollChildIntoView(menuChoice?.node.id ?? "");
  }, [menuChoice?.node.id]);
  // Pagination: reaching the last loaded item (or last Grid row) loads the
  // next page once per item count, until `hasMore` turns false.
  useEffect(() => {
    if (!pagination || !handler(pagination.onLoadMore) || pagination.hasMore !== true) return;
    const last = view.items.at(-1);
    if (!last || selectionId(last) !== id) return;
    if (paginatedFor.current === view.items.length) return;
    paginatedFor.current = view.items.length;
    send(handlerEvent(view.list, pagination.onLoadMore));
  }, [id, scene?.revision]);
  function search(value: string) {
    if (currentSearch.current === value) return;
    currentSearch.current = value;
    setSearch(value);
    clearTimeout(timer.current);
    if (!handler(view.list?.props.onSearchTextChange)) return;
    pendingSearch.current = value;
    const dispatch = () => {
      send(event(view.list, "onSearchTextChange", [value]));
    };
    if (view.list?.props.throttle) timer.current = setTimeout(dispatch, 200);
    else dispatch();
  }
  useKeyboard((key) => {
    function run(node: SceneNode | undefined) {
      send(event(node, handler(node?.props.onAction) ? "onAction" : "onSubmit"));
    }
    if (key.ctrl && key.name === "c") {
      if (onExitRef.current) onExitRef.current();
      else requestQuit();
      return;
    }
    if (failure) {
      // A failed runtime only waits for Esc to quit.
      if (key.name === "escape") {
        key.preventDefault();
        requestQuit();
      }
      return;
    }
    if (alert) {
      key.preventDefault();
      const name =
        key.name === "return" ? "primaryAction" : key.name === "escape" ? "dismissAction" : "";
      run(alert.children.find((node) => node.props.name === name));
      return;
    }
    if (isMenu) {
      if (key.name === "escape" || key.name === "left") {
        key.preventDefault();
        if (menuPath.length) {
          setMenuPath(menuPath.slice(0, -1));
          setSelected(null);
        } else if (key.name === "escape") {
          if (handler(view.navigation?.props.pop)) send(event(view.navigation, "pop"));
          else requestQuit();
        }
        return;
      }
      if (key.name === "up" || key.name === "down") {
        key.preventDefault();
        const at = menuItems.findIndex((row) => row.node === menuChoice?.node);
        const next =
          menuItems[
            Math.max(0, Math.min(menuItems.length - 1, at + (key.name === "down" ? 1 : -1)))
          ];
        const nextId = next ? selectionId(next.node) : null;
        if (next && nextId !== selectionId(menuChoice?.node)) {
          previous.current = nextId;
          setSelected(nextId);
          send(event(view.list, "onSelectionChange", [nextId]));
        }
        return;
      }
      if (key.name === "return" || key.name === "right") {
        key.preventDefault();
        if (menuChoice?.node.type === "MenuBarExtra.Submenu") {
          setMenuPath([...menuPath, menuChoice.node.id]);
          setSelected(null);
        } else if (menuChoice && !menuChoice.disabled) {
          send(
            handlerEvent(menuChoice.node, menuChoice.node.props.onAction, [{ type: "left-click" }]),
          );
        }
        return;
      }
      return;
    }
    if (dropdownOpen) {
      if (key.name === "escape") {
        key.preventDefault();
        closeDropdown();
      } else if (key.name === "up" || key.name === "down") {
        key.preventDefault();
        setDropdownIndex(
          Math.max(
            0,
            Math.min(dropdownChoices.length - 1, dropdownIndex + (key.name === "down" ? 1 : -1)),
          ),
        );
      } else if (key.name === "return" && dropdownChoice) {
        key.preventDefault();
        send(event(dropdown, "onChange", [dropdownChoice.value]));
        closeDropdown();
      }
      return;
    }
    if (panel !== null) {
      if (key.name === "escape") {
        key.preventDefault();
        setPanel(panel.length ? panel.slice(0, -1) : null);
        setQuery("");
        setActionIndex(0);
      } else if (key.name === "up" || key.name === "down") {
        key.preventDefault();
        setActionIndex(
          Math.max(
            0,
            Math.min(panelItems.length - 1, actionIndex + (key.name === "down" ? 1 : -1)),
          ),
        );
      } else if (key.name === "return") {
        key.preventDefault();
        if (chosen?.type === "ActionPanel.Submenu") {
          send(event(chosen, "onOpen"));
          setPanel([...panel, chosen.id]);
          setQuery("");
          setActionIndex(0);
        } else {
          run(chosen);
          setPanel(null);
        }
      }
      return;
    }
    if (key.ctrl && key.name === "k") {
      key.preventDefault();
      setPanel([]);
      setQuery("");
      setActionIndex(0);
      return;
    }
    if (panel === null && key.ctrl && key.name === "p") {
      key.preventDefault();
      setDropdownOpen(true);
      setDropdownQuery("");
      setDropdownIndex(0);
      return;
    }
    if (key.name === "escape") {
      if (handler(view.navigation?.props.pop)) send(event(view.navigation, "pop"));
      else requestQuit();
      return;
    }
    const toastAction = toast?.children.find(
      (node, index) =>
        (key.ctrl && key.name === (index === 0 ? "t" : "y")) ||
        matchesShortcut(node.props.shortcut, key),
    );
    if (toastAction) {
      key.preventDefault();
      run(toastAction);
      return;
    }
    const shortcut = actionRows(view.actions).find(
      (row) => row.item && matchesShortcut(row.node.props.shortcut, key),
    );
    if (shortcut) {
      key.preventDefault();
      if (shortcut.node.type === "ActionPanel.Submenu") {
        send(event(shortcut.node, "onOpen"));
        setPanel([shortcut.node.id]);
        setQuery("");
        setActionIndex(0);
      } else run(shortcut.node);
      return;
    }
    if (view.list?.type === "Form") return;
    if (
      key.name === "up" ||
      key.name === "down" ||
      (view.grid && (key.name === "left" || key.name === "right"))
    ) {
      key.preventDefault();
      const index = view.items.findIndex((item) => item.id === view.selected?.id);
      const nextId = view.grid
        ? gridMove(view.grid.rows, id, key.name as "up" | "down" | "left" | "right")
        : selectionId(
            view.items[
              Math.max(0, Math.min(view.items.length - 1, index + (key.name === "down" ? 1 : -1)))
            ],
          );
      if (nextId !== id) {
        previous.current = nextId;
        send(event(view.list, "onSelectionChange", [nextId]));
        setSelected(nextId);
      }
    }
    if (key.name === "return")
      send(event(view.primary, handler(view.primary?.props.onAction) ? "onAction" : "onSubmit"));
  });
  return (
    <box flexDirection="column" height="100%" padding={1}>
      <text height={1} flexShrink={0}>
        {view.title}
        {view.loading ? "  Loading…" : ""}
      </text>
      {view.list?.type === "Form" ? (
        <FormView
          key={view.list.id}
          form={view.list}
          enabled={panel === null && !alert}
          send={send}
          submit={() =>
            send(
              event(view.primary, handler(view.primary?.props.onAction) ? "onAction" : "onSubmit"),
            )
          }
        />
      ) : isMenu ? (
        <box flexDirection="row" flexGrow={1}>
          <scrollbox ref={scroll} flexGrow={1}>
            <MenuBarView
              rows={menu}
              selectedId={menuChoice ? selectionId(menuChoice.node) : null}
            />
          </scrollbox>
        </box>
      ) : (
        <>
          <box flexDirection="row" flexShrink={0}>
            <input
              flexGrow={1}
              focused={panel === null && !alert && !dropdownOpen}
              value={searchText}
              placeholder={text(view.list?.props.searchBarPlaceholder) || "Search…"}
              onInput={search}
            />
            {dropdown && (
              <text
                flexShrink={0}
              >{` ▾ ${dropdownLabel(dropdown, dropdownOptions(dropdown))}`}</text>
            )}
          </box>
          <box flexDirection="row" flexGrow={1}>
            <scrollbox
              ref={scroll}
              flexGrow={1}
              width={view.list?.type === "Detail" ? 0 : view.detail ? "50%" : "100%"}
            >
              {view.grid ? (
                <GridView layout={view.grid} selectedId={id} emptyText={view.emptyText} />
              ) : (
                <>
                  {view.rows.map((row) => (
                    <text
                      key={row.node.id}
                      id={row.node.id}
                      height={1}
                      flexShrink={0}
                      {...(row.node.id === view.selected?.id ? { bg: "#234567" } : {})}
                    >
                      {row.item ? (row.node.id === view.selected?.id ? "› " : "  ") : ""}
                      {row.text}
                    </text>
                  ))}
                  {view.list?.type !== "Detail" && view.rows.length === 0 && (
                    <text>{view.emptyText}</text>
                  )}
                </>
              )}
            </scrollbox>
            {view.detail && (
              <scrollbox flexGrow={1} width={view.list?.type === "Detail" ? "100%" : "50%"}>
                <text height={view.detail.split("\n").length} flexShrink={0}>
                  {view.detail}
                </text>
              </scrollbox>
            )}
          </box>
        </>
      )}
      {panel !== null && (
        <box
          flexDirection="column"
          border
          flexShrink={0}
          height={Math.min(panelRows.length + 3, 14)}
          title={text(panelNode?.props.title) || "Actions"}
        >
          <input
            focused={!alert}
            value={query}
            placeholder="Filter actions…"
            onInput={(value) => {
              setQuery(value);
              setActionIndex(0);
              send(event(panelNode, "onSearchTextChange", [value]));
            }}
          />
          <scrollbox ref={actionScroll} flexGrow={1}>
            {panelRows.map((row) => (
              <text id={row.node.id} height={1} flexShrink={0} key={row.node.id}>
                {row.node.id === chosen?.id ? "› " : "  "}
                {row.text}
              </text>
            ))}
          </scrollbox>
        </box>
      )}
      {dropdownOpen && dropdown && (
        <DropdownPanel
          dropdown={dropdown}
          query={dropdownQuery}
          index={dropdownIndex}
          onQuery={(value) => {
            setDropdownQuery(value);
            setDropdownIndex(0);
          }}
        />
      )}
      {toast && (
        <text height={1} flexShrink={0}>
          {[
            text(toast.props.style),
            text(toast.props.title),
            text(toast.props.message),
            ...toast.children.map(
              (node, index) => `Ctrl-${index === 0 ? "T" : "Y"} ${text(node.props.title)}`,
            ),
          ]
            .filter(Boolean)
            .join(" · ")}
        </text>
      )}
      {hudVisible && hud && (
        <text height={1} flexShrink={0}>
          {text(hud.props.title)}
        </text>
      )}
      {failure && (
        <box border flexDirection="column" height={4} flexShrink={0} title="Error">
          <text height={1} flexShrink={0}>
            {failure}
          </text>
          <text height={1} flexShrink={0}>
            Esc Quit
          </text>
        </box>
      )}
      {alert && (
        <box border flexDirection="column" height={4} flexShrink={0} title="Alert">
          <text height={1} flexShrink={0}>
            {text(alert.props.title)} {text(alert.props.message)}
          </text>
          <text height={1} flexShrink={0}>
            {alert.children
              .map(
                (node) =>
                  `${node.props.name === "primaryAction" ? "Enter" : "Esc"} ${text(node.props.title)}`,
              )
              .join(" · ")}
          </text>
        </box>
      )}
      <text height={1} flexShrink={0}>
        {view.list?.type === "Form"
          ? "Tab/Shift-Tab Fields · ←→ Options · Ctrl-S Submit · "
          : "↑↓ Select · "}
        Enter {text(view.primary?.props.title) || "Run"} · Ctrl-K Actions · Esc Back / Quit
      </text>
    </box>
  );
}
