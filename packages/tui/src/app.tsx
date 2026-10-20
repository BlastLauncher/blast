/** @jsxImportSource @opentui/react */
import { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage } from "@blastlauncher/protocol";
import {
  activeNode,
  createController,
  type ControllerInput,
  type ControllerResult,
  type Platform,
} from "@blastlauncher/client-core";
import { GridView } from "./grid.tsx";
import { DropdownPanel } from "./dropdown.tsx";
import { MenuBarView } from "./menu-bar.tsx";
import { FormView } from "./form.tsx";
import { theme } from "./theme.ts";

const platform: Platform =
  process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux";

/**
 * A terminal over the client-core controller: keys become controller inputs,
 * the controller's events go to the session and its effects run here. Only the
 * scene (for decorative form children) and the rendered view
 * are kept besides the controller.
 */
export function App({
  session,
  onQuit,
  onExit,
  hudDurationMs,
}: {
  session: Session;
  onQuit: () => void;
  /** Ctrl-C, which quits the whole TUI even when a picker owns the session. */
  onExit?: () => void;
  hudDurationMs?: number;
}) {
  const controller = useMemo(
    () => createController({ platform, ...(hudDurationMs === undefined ? {} : { hudDurationMs }) }),
    [session, hudDurationMs],
  );
  const [view, setView] = useState(() => controller.view());
  const [scene, setScene] = useState<SceneMessage | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const scroll = useRef<ScrollBoxRenderable>(null);
  const actionScroll = useRef<ScrollBoxRenderable>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const quitRequested = useRef(false);
  const settled = useRef(false);
  const onQuitRef = useRef(onQuit);
  onQuitRef.current = onQuit;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const requestQuit = () => {
    if (quitRequested.current) return;
    quitRequested.current = true;
    onQuitRef.current();
  };
  // A runtime that exits on its own is a no-view command: quit once its HUD
  // (if any) has gone. A failed runtime shows the error and waits for Esc.
  const quitIfSettled = () => {
    if (settled.current && !controller.view().feedback.hud) requestQuit();
  };
  const dispatch = (result: ControllerResult) => {
    for (const out of result.events) session.sendEvent(out.node, out.handler, out.args);
    for (const effect of result.effects) {
      if (effect.type === "quit") requestQuit();
      else {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          dispatch(controller.tick(effect.token));
        }, effect.ms);
        timers.current.add(timer);
      }
    }
    quitIfSettled();
  };
  const input = (action: ControllerInput) => dispatch(controller.input(action));
  useEffect(() => {
    setView(controller.view());
    const stop = controller.subscribe(setView);
    // A session replays its latest scene on subscribe; a stand-in that does not
    // is still seeded from `latestScene`.
    let applied: SceneMessage | undefined;
    const apply = (next: SceneMessage) => {
      if (next === applied) return;
      applied = next;
      setScene(next);
      dispatch(controller.scene(next));
    };
    if (session.latestScene) apply(session.latestScene);
    const stopScenes = session.scenes(apply);
    return () => {
      stopScenes();
      stop();
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    };
  }, [session, controller]);
  useEffect(() => {
    let active = true;
    void session.exited.then((exit) => {
      if (!active) return;
      if (exit.error || exit.code !== 0)
        setFailure(exit.error ? String(exit.error) : `Runtime exited: ${exit.code ?? exit.signal}`);
      else if (!quitRequested.current) {
        settled.current = true;
        quitIfSettled();
      }
    });
    return () => {
      active = false;
    };
  }, [session, controller]);
  const selectedRow = view.rows.find((row) => row.selected)?.id;
  const selectedCell = view.grid?.flatMap((row) => row.cells).find((cell) => cell.selected)?.id;
  const selectedMenu = view.menuBar?.rows.find((row) => row.selected)?.id;
  useEffect(() => {
    scroll.current?.scrollChildIntoView(selectedRow ?? selectedCell ?? selectedMenu ?? "");
  }, [selectedRow, selectedCell, selectedMenu]);
  const chosenAction = view.actions.rows.find((row) => row.selected)?.id;
  useEffect(() => {
    actionScroll.current?.scrollChildIntoView(chosenAction ?? "");
  }, [chosenAction]);
  const { alert, toast, hud } = view.feedback;
  useKeyboard((key) => {
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
    const now = controller.view();
    const press = (action: ControllerInput) => {
      key.preventDefault();
      input(action);
    };
    if (now.feedback.alert) {
      key.preventDefault();
      if (key.name === "return") input({ type: "alert", confirm: true });
      else if (key.name === "escape") input({ type: "alert", confirm: false });
      return;
    }
    const direction = ({ up: "up", down: "down", left: "left", right: "right" } as const)[
      key.name as "up"
    ];
    const menu = now.kind === "menu-bar";
    // The menu bar, the dropdown and the action panel own the arrows, Enter
    // and Esc while they are open.
    if (menu || now.dropdown?.open || now.actions.open) {
      if (key.name === "escape") press({ type: "back" });
      else if (direction && (menu || direction === "up" || direction === "down"))
        press({ type: "move", direction });
      else if (key.name === "return") press({ type: "primary" });
      return;
    }
    if (key.ctrl && key.name === "k") return press({ type: "openActions" });
    if (key.ctrl && key.name === "p") return press({ type: "openDropdown" });
    if (key.name === "escape") return input({ type: "back" });
    const toastIndex = key.ctrl ? ["t", "y"].indexOf(key.name) : -1;
    if (toastIndex >= 0 && now.feedback.toast?.actions[toastIndex])
      return press({ type: "toastAction", index: toastIndex });
    const result = controller.input({
      type: "key",
      key: {
        name: key.name,
        ctrl: key.ctrl,
        meta: key.meta,
        shift: key.shift,
        option: key.option,
        super: key.super === true,
      },
    });
    dispatch(result);
    if (result.handled) return key.preventDefault();
    if (now.kind === "form") return;
    if (direction === "up" || direction === "down" || (now.grid && direction)) {
      key.preventDefault();
      input({ type: "move", direction });
    }
    if (key.name === "return") input({ type: "primary" });
  });

  const form = view.kind === "form" ? activeNode(scene?.root) : undefined;
  const dropdown = view.dropdown;
  let toastColor: string = theme.colors.text;
  const toastParts = toast
    ? [
        toast.style,
        toast.title,
        toast.message,
        ...toast.actions.map((action, index) => `Ctrl-${index === 0 ? "T" : "Y"} ${action.title}`),
      ].filter(Boolean)
    : [];
  if (toast) {
    if (toast.style === "failure") toastColor = theme.colors.danger;
    else if (toast.style === "success") toastColor = theme.colors.success;
    else if (toast.style === "animated") toastColor = theme.colors.accent;
  }
  const hudText = hud ? hud.title : "";
  const leftFooter = [
    toastParts.join(" · "),
    hudText,
    !toastParts.length && !hudText && view.loading ? "Loading…" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const primaryTitle = view.primary.title;

  return (
    <box
      flexDirection="column"
      height="100%"
      borderStyle="rounded"
      borderColor={theme.colors.border}
      backgroundColor={theme.colors.background}
      title={view.title}
    >
      {form ? (
        <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
          <FormView
            key={form.id}
            form={form}
            view={view.form!}
            enabled={!view.actions.open && !alert}
            input={input}
          />
        </box>
      ) : view.menuBar ? (
        <box flexDirection="row" flexGrow={1} paddingLeft={1} paddingRight={1}>
          <scrollbox ref={scroll} flexGrow={1}>
            <MenuBarView rows={view.menuBar.rows} />
          </scrollbox>
        </box>
      ) : (
        <>
          <box flexDirection="row" flexShrink={0} paddingLeft={1} paddingRight={1}>
            <text flexShrink={0} fg={theme.colors.accent}>
              {`${theme.glyphs.search} `}
            </text>
            <input
              flexGrow={1}
              focused={!view.actions.open && !alert && !dropdown?.open}
              value={view.search.text}
              placeholder={view.search.placeholder}
              placeholderColor={theme.colors.textMuted}
              textColor={theme.colors.text}
              onInput={(value) => input({ type: "search", text: value })}
            />
            {dropdown && (
              <text
                flexShrink={0}
                wrapMode="none"
                fg={theme.colors.textMuted}
              >{`▾ ${dropdown.label}`}</text>
            )}
          </box>
          <box
            height={1}
            flexShrink={0}
            border={["top"]}
            borderStyle="single"
            borderColor={theme.colors.border}
          />
          <box flexDirection="row" flexGrow={1} paddingLeft={1} paddingRight={1}>
            <scrollbox
              ref={scroll}
              flexGrow={1}
              width={view.kind === "detail" ? 0 : view.detail ? "50%" : "100%"}
            >
              {view.grid ? (
                <GridView rows={view.grid} emptyText={view.emptyText} />
              ) : (
                <>
                  {view.rows.map((row) => {
                    const isSelected = row.selected;
                    if (row.kind !== "item") {
                      return (
                        <box
                          key={row.id}
                          id={row.id}
                          flexDirection="row"
                          justifyContent="space-between"
                          height={1}
                          flexShrink={0}
                          width="100%"
                        >
                          <text
                            flexGrow={1}
                            flexShrink={1}
                            wrapMode="none"
                            fg={theme.colors.textMuted}
                            attributes={TextAttributes.BOLD}
                          >
                            {row.title}
                          </text>
                          {row.count !== null ? (
                            <text flexShrink={0} wrapMode="none" fg={theme.colors.textMuted}>
                              {row.count}
                            </text>
                          ) : null}
                        </box>
                      );
                    }
                    return (
                      <box
                        key={row.id}
                        id={row.id}
                        flexDirection="row"
                        width="100%"
                        height={1}
                        flexShrink={0}
                        {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                      >
                        <text
                          flexShrink={0}
                          wrapMode="none"
                          fg={theme.colors.accent}
                          {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                        >
                          {isSelected ? `${theme.glyphs.pointer} ` : "  "}
                        </text>
                        <text
                          flexShrink={0}
                          wrapMode="none"
                          fg={theme.colors.text}
                          {...(isSelected ? { attributes: TextAttributes.BOLD } : {})}
                          {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                        >
                          {row.title}
                        </text>
                        {row.subtitle ? (
                          <text
                            flexShrink={1}
                            wrapMode="none"
                            fg={theme.colors.textMuted}
                            {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                          >
                            {`  ${row.subtitle}`}
                          </text>
                        ) : null}
                        <box
                          flexGrow={1}
                          flexShrink={0}
                          {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                        />
                        {row.accessories ? (
                          <text
                            flexShrink={0}
                            wrapMode="none"
                            fg={theme.colors.textMuted}
                            {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                          >
                            {row.accessories}
                          </text>
                        ) : null}
                      </box>
                    );
                  })}
                  {view.kind !== "detail" && view.rows.length === 0 && (
                    <text fg={theme.colors.textMuted}>{view.emptyText}</text>
                  )}
                </>
              )}
            </scrollbox>
            {view.detail && (
              <scrollbox flexGrow={1} width={view.kind === "detail" ? "100%" : "50%"}>
                <text height={view.detail.split("\n").length} flexShrink={0} fg={theme.colors.text}>
                  {view.detail}
                </text>
              </scrollbox>
            )}
          </box>
        </>
      )}
      {view.actions.open && (
        <box
          position="absolute"
          bottom={1}
          right={1}
          zIndex={10}
          width={36}
          flexDirection="column"
          borderStyle="rounded"
          borderColor={theme.colors.border}
          backgroundColor={theme.colors.panel}
          flexShrink={0}
          height={Math.min(view.actions.rows.length + 3, 14)}
          title={view.actions.title}
        >
          <input
            focused={!alert}
            value={view.actions.query}
            placeholder="Filter actions…"
            placeholderColor={theme.colors.textMuted}
            textColor={theme.colors.text}
            backgroundColor={theme.colors.panel}
            focusedBackgroundColor={theme.colors.panel}
            onInput={(value) => input({ type: "actionsQuery", text: value })}
          />
          <scrollbox ref={actionScroll} flexGrow={1}>
            {view.actions.rows.map((row, rowIndex) => {
              const isChosen = row.selected;
              if (row.kind === "section") {
                return (
                  <box key={row.id} id={row.id} height={1} flexShrink={0} width="100%">
                    <text flexGrow={1} fg={theme.colors.textMuted} attributes={TextAttributes.BOLD}>
                      {row.title}
                    </text>
                  </box>
                );
              }
              const first = view.actions.rows.findIndex((it) => it.kind !== "section") === rowIndex;
              const shortcut = row.shortcut || (first ? theme.glyphs.enter : "");
              const isSubmenu = row.kind === "submenu";
              return (
                <box
                  key={row.id}
                  id={row.id}
                  flexDirection="row"
                  width="100%"
                  height={1}
                  flexShrink={0}
                  {...(isChosen ? { backgroundColor: theme.colors.selectionBg } : {})}
                >
                  <text
                    flexShrink={0}
                    wrapMode="none"
                    fg={theme.colors.accent}
                    {...(isChosen ? { backgroundColor: theme.colors.selectionBg } : {})}
                  >
                    {isChosen ? `${theme.glyphs.pointer} ` : "  "}
                  </text>
                  <text
                    flexShrink={0}
                    wrapMode="none"
                    fg={theme.colors.text}
                    {...(isChosen ? { attributes: TextAttributes.BOLD } : {})}
                    {...(isChosen ? { backgroundColor: theme.colors.selectionBg } : {})}
                  >
                    {row.title}
                  </text>
                  <box
                    flexGrow={1}
                    flexShrink={0}
                    {...(isChosen ? { backgroundColor: theme.colors.selectionBg } : {})}
                  />
                  {isSubmenu ? (
                    <text
                      flexShrink={0}
                      wrapMode="none"
                      fg={theme.colors.textMuted}
                      {...(isChosen ? { backgroundColor: theme.colors.selectionBg } : {})}
                    >
                      {shortcut ? `${shortcut}  ${theme.glyphs.pointer}` : theme.glyphs.pointer}
                    </text>
                  ) : shortcut ? (
                    <text
                      flexShrink={0}
                      wrapMode="none"
                      fg={theme.colors.textMuted}
                      {...(isChosen ? { backgroundColor: theme.colors.selectionBg } : {})}
                    >
                      {shortcut}
                    </text>
                  ) : null}
                </box>
              );
            })}
          </scrollbox>
        </box>
      )}
      {dropdown?.open && (
        <DropdownPanel
          dropdown={dropdown}
          onQuery={(value) => input({ type: "dropdownQuery", text: value })}
        />
      )}
      {failure && (
        <box
          position="absolute"
          top="25%"
          left="15%"
          width="70%"
          zIndex={50}
          borderStyle="rounded"
          borderColor={theme.colors.danger}
          backgroundColor={theme.colors.panel}
          flexDirection="column"
          padding={1}
          title="Error"
        >
          <text fg={theme.colors.text} height={1} flexShrink={0}>
            {failure}
          </text>
          <text fg={theme.colors.textMuted} height={1} flexShrink={0}>
            Esc Quit
          </text>
        </box>
      )}
      {alert && (
        <box
          position="absolute"
          top="25%"
          left="15%"
          width="70%"
          zIndex={50}
          borderStyle="rounded"
          borderColor={theme.colors.warning}
          backgroundColor={theme.colors.panel}
          flexDirection="column"
          padding={1}
          title="Alert"
        >
          <text fg={theme.colors.text} height={1} flexShrink={0}>
            {alert.title} {alert.message}
          </text>
          <text fg={theme.colors.textMuted} height={1} flexShrink={0}>
            {[
              alert.primary && `Enter ${alert.primary.title}`,
              alert.dismiss && `Esc ${alert.dismiss.title}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </text>
        </box>
      )}
      <box
        height={1}
        flexShrink={0}
        backgroundColor={theme.colors.panel}
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text flexGrow={1} flexShrink={1} wrapMode="none" fg={toastColor}>
          {leftFooter}
        </text>
        <text flexShrink={0} wrapMode="none">
          <span fg={theme.colors.text}>{primaryTitle}</span>
          <span fg={theme.colors.textMuted}>{` ${theme.glyphs.enter}  `}</span>
          <span fg={theme.colors.text}>Actions</span>
          <span fg={theme.colors.textMuted}>{` ${theme.glyphs.actionMod}`}</span>
        </text>
      </box>
    </box>
  );
}
