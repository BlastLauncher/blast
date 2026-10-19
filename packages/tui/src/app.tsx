/** @jsxImportSource @opentui/react */
import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage } from "@blastlauncher/protocol";
import { event, handler, sceneToView, selectionId, text } from "./view.ts";

export function App({ session, onQuit }: { session: Session; onQuit: () => void }) {
  const [scene, setScene] = useState<SceneMessage | undefined>(session.latestScene);
  const [searchText, setSearch] = useState("");
  const currentSearch = useRef("");
  const [selectedId, setSelected] = useState<string | null>(null);
  const scroll = useRef<ScrollBoxRenderable>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSearch = useRef<string | undefined>(undefined);
  const previous = useRef<string | null | undefined>(undefined);
  const view = sceneToView(scene, { searchText, selectedId });
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
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      onQuit();
      return;
    }
    if (key.name === "up" || key.name === "down") {
      key.preventDefault();
      const index = view.items.findIndex((item) => item.id === view.selected?.id);
      const next =
        view.items[
          Math.max(0, Math.min(view.items.length - 1, index + (key.name === "down" ? 1 : -1)))
        ];
      const nextId = selectionId(next);
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
      <input
        focused
        value={searchText}
        placeholder={text(view.list?.props.searchBarPlaceholder) || "Search…"}
        onInput={search}
      />
      <scrollbox ref={scroll} flexGrow={1}>
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
        {view.rows.length === 0 && <text>{view.emptyText}</text>}
      </scrollbox>
      <text height={1} flexShrink={0}>
        ↑↓ Select · Enter {text(view.primary?.props.title) || "Run"} · Esc / Ctrl-C Quit
      </text>
    </box>
  );
}
