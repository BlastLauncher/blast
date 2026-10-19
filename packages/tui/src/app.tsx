/** @jsxImportSource @opentui/react */
import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import {
  event,
  handler,
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

import { FormView } from "./form.tsx";

export function App({ session, onQuit }: { session: Session; onQuit: () => void }) {
  const [scene, setScene] = useState<SceneMessage | undefined>(session.latestScene);
  const [panel, setPanel] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [actionIndex, setActionIndex] = useState(0);
  const [hudVisible, setHudVisible] = useState(false);
  const [searchText, setSearch] = useState("");
  const currentSearch = useRef("");
  const [selectedId, setSelected] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownQuery, setDropdownQuery] = useState("");
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const scroll = useRef<ScrollBoxRenderable>(null);
  const actionScroll = useRef<ScrollBoxRenderable>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSearch = useRef<string | undefined>(undefined);
  const previous = useRef<string | null | undefined>(undefined);
  const view = sceneToView(scene, { searchText, selectedId });
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
    setDropdownOpen(false);
    setDropdownQuery("");
    setDropdownIndex(0);
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
    if (props.closeMainWindow) onQuit();
  }, [scene?.revision]);
  useEffect(() => {
    setHudVisible(!!hud);
    if (!hud) return;
    const timeout = setTimeout(() => setHudVisible(false), 2500);
    return () => clearTimeout(timeout);
  }, [hud?.id, hud?.props.title]);
  const id = selectionId(view.selected);
  useEffect(() => {
    setSelected(id);
    scroll.current?.scrollChildIntoView(view.selected?.id ?? "");
    if (previous.current !== id) {
      previous.current = id;
      send(event(view.list, "onSelectionChange", [id]));
    }
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
      onQuit();
      return;
    }
    if (alert) {
      key.preventDefault();
      const name =
        key.name === "return" ? "primaryAction" : key.name === "escape" ? "dismissAction" : "";
      run(alert.children.find((node) => node.props.name === name));
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
      else onQuit();
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
