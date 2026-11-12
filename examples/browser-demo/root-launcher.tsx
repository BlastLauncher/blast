// The demo package intentionally does not carry React's type package.
// @ts-ignore React is provided by the browser demo bundle.
import { Command } from "cmdk";
// @ts-ignore React is provided by the browser demo bundle.
import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DemoStatus } from "./status.ts";
import type { RootAction, RootRow } from "./root.ts";

export type RootSection = { title: string; rows: RootRow[] };
export type RootLauncherProps = {
  query: string;
  selected: number;
  rows: RootRow[];
  sections: RootSection[];
  actions: RootAction[];
  actionOpen: boolean;
  actionQuery: string;
  actionSelected: number;
  status: DemoStatus;
  toast?: string;
  /** Platform labels: `↵`/`⌘K` on macOS, `Enter`/`Ctrl+K` elsewhere. */
  primaryKey: string;
  actionsKey: string;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onHighlight: (id: string) => void;
  onActionQuery: (query: string) => void;
  onActionHighlight: (id: string) => void;
  onAction: (id: string) => void;
  onFooter: (action: "primary" | "actions" | "back") => void;
};
const scheduleFrame = (callback: () => void) => {
  const browser = globalThis as unknown as {
    requestAnimationFrame?: (callback: () => void) => void;
  };
  (browser.requestAnimationFrame ?? ((next) => setTimeout(next, 0)))(callback);
};

/**
 * cmdk refocuses its input by its generated id whenever the highlighted value
 * changes, and falls back to focusing the list. These inputs carry our own ids
 * (`#root-search`), so that lookup always misses: without this the list takes
 * focus mid-typing, keys stop reaching the input and the list draws a focus
 * ring. The list keeps cmdk's tabindex -1, so Tab still skips it.
 */
const caretBack =
  (input: { current: unknown }) => (event: { target: unknown; currentTarget: unknown }) => {
    if (event.target === event.currentTarget) (input.current as { focus(): void } | null)?.focus();
  };

/** Fetching, installing, bundling and starting all draw the loader line. */
export const statusBusy = (status: DemoStatus) =>
  !status.error && status.stage !== "ready" && status.stage !== "info";

export const statusMarkup = (status: DemoStatus) => (
  <span
    id="status"
    role="status"
    data-error={status.error ? "true" : "false"}
    data-stage={status.stage}
  >
    {status.text}
  </span>
);

/** Blast's own mark for the root footer, where Raycast shows its logo. */
const BlastMark = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <rect width="20" height="20" rx="5" fill="currentColor" opacity="0.18" />
    <path
      d="M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4Z"
      fill="currentColor"
    />
  </svg>
);

function Row({
  row,
  index,
  onSelect,
  selected,
}: {
  row: RootRow;
  index: number;
  onSelect: (id: string) => void;
  selected?: boolean;
  key?: string;
}) {
  return (
    <Command.Item
      id={`root-option-${index}`}
      value={row.id}
      onSelect={onSelect}
      className="root-item"
      data-root-index={index}
      aria-selected={selected}
    >
      <span className="root-icon" aria-hidden="true">
        {row.iconUrl ? <img src={row.iconUrl} alt="" width="20" height="20" /> : row.icon}
      </span>
      <span className="root-copy">
        <strong>{row.title}</strong>
        <small>{row.subtitle}</small>
      </span>
      {row.unavailable ? (
        <span className="root-badge">
          {row.unavailable === "macos" ? "Needs macOS" : "Needs setup"}
        </span>
      ) : null}
      <span className="root-accessory">{row.accessory}</span>
    </Command.Item>
  );
}

function Actions({ props }: { props: RootLauncherProps }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.id = "root-action-search";
    inputRef.current?.focus();
  }, []);
  const selected = props.actions[props.actionSelected]?.id;
  return (
    <Command
      className="actions"
      shouldFilter={false}
      {...(selected ? { value: selected } : {})}
      onValueChange={props.onActionHighlight}
      label="Command actions"
    >
      <strong>{props.rows[props.selected]?.title ?? "Actions"}</strong>
      <Command.Input
        ref={inputRef}
        value={props.actionQuery}
        onValueChange={props.onActionQuery}
        placeholder="Search actions…"
        aria-label="Search actions"
      />
      <Command.List id="root-actions" role="listbox" onFocus={caretBack(inputRef)}>
        {props.actions.map((action) => (
          <Command.Item key={action.id} value={action.id} onSelect={props.onAction}>
            <span>{action.title}</span>
            {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
          </Command.Item>
        ))}
        <Command.Empty>No matching actions</Command.Empty>
      </Command.List>
    </Command>
  );
}

export function RootLauncher(props: RootLauncherProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.id = "root-search";
    inputRef.current?.focus();
  }, []);
  // After every commit, a launcher that lost focus (remounted on return from a
  // command, closed ⌘K panel) puts the caret back in its search field. Focus
  // that sits on a real control, e.g. a footer button reached with Tab, stays.
  useEffect(() => {
    const browser = globalThis as unknown as {
      document?: {
        body: unknown;
        activeElement: { isConnected: boolean } | null;
        querySelector(selector: string): { focus(): void } | null;
      };
    };
    const document = browser.document;
    const active = document?.activeElement;
    if (!document || (active && active !== document.body && active.isConnected)) return;
    document.querySelector(props.actionOpen ? "#root-action-search" : "#root-search")?.focus();
  });
  useEffect(() => {
    scheduleFrame(() => {
      const browser = globalThis as unknown as {
        document?: {
          querySelector(selector: string): {
            scrollIntoView(options: { block: string }): void;
          } | null;
        };
      };
      browser.document?.querySelector('[data-selected="true"]')?.scrollIntoView({
        block: "nearest",
      });
    });
  }, [props.query, props.selected, props.actionSelected]);
  const rows = props.query.trim() ? props.rows : props.sections.flatMap((section) => section.rows);
  const selected = props.rows[props.selected]?.id;
  return (
    <div className="root-shell">
      <Command
        className="root-command"
        shouldFilter={false}
        {...(selected ? { value: selected } : {})}
        onValueChange={props.onHighlight}
        label="Extension commands"
      >
        <main
          className="root"
          data-kind="root"
          data-loading={statusBusy(props.status) ? "true" : "false"}
        >
          <header>
            <h1>Blast</h1>
            <Command.Input
              ref={inputRef}
              value={props.query}
              onValueChange={props.onQuery}
              placeholder="Search extension commands…"
              aria-label="Search extension commands"
            />
          </header>
          <Command.List
            id="root-options"
            className="rows root-options"
            role="listbox"
            aria-label="Extension commands"
            onFocus={caretBack(inputRef)}
          >
            {props.query.trim()
              ? rows.map((row, index) => (
                  <Row
                    key={row.id}
                    row={row}
                    index={index}
                    selected={row.id === selected}
                    onSelect={props.onSelect}
                  />
                ))
              : props.sections.map((section) => (
                  <Command.Group key={section.title} heading={section.title} className="root-group">
                    {section.rows.map((row) => (
                      <Row
                        key={row.id}
                        row={row}
                        index={rows.findIndex((candidate) => candidate.id === row.id)}
                        selected={row.id === selected}
                        onSelect={props.onSelect}
                      />
                    ))}
                  </Command.Group>
                ))}
            <Command.Empty className="empty">No matching commands</Command.Empty>
          </Command.List>
          {props.actionOpen ? <Actions props={props} /> : null}
          <footer>
            <span className="footer-context" aria-hidden="true">
              <span className="footer-icon">
                <BlastMark />
              </span>
              <span className="footer-title">Blast</span>
            </span>
            {statusMarkup(props.status)}
            <span className="footer-hints">
              <button
                type="button"
                className="footer-key"
                data-footer="primary"
                onClick={() => props.onFooter("primary")}
              >
                <span>Open Command</span>
                <kbd>{props.primaryKey}</kbd>
              </button>
              <button
                type="button"
                className="footer-key"
                data-footer="actions"
                onClick={() => props.onFooter("actions")}
              >
                <span>Actions</span>
                <kbd>{props.actionsKey}</kbd>
              </button>
            </span>
            {props.status.stage !== "ready" ? (
              <button
                type="button"
                className="footer-key"
                data-footer="back"
                onClick={() => props.onFooter("back")}
              >
                <span>Clear</span>
                <kbd>Esc</kbd>
              </button>
            ) : null}
            {props.toast ? (
              <span role="status" className="root-toast">
                {props.toast}
              </span>
            ) : null}
          </footer>
        </main>
      </Command>
    </div>
  );
}

export function mountRoot(element: HTMLElement, props: RootLauncherProps): Root {
  const root = createRoot(element);
  root.render(<RootLauncher {...props} />);
  return root;
}
export function updateRoot(root: Root, props: RootLauncherProps): void {
  root.render(<RootLauncher {...props} />);
}
