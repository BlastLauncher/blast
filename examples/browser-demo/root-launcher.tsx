// @ts-nocheck
import { Command } from "cmdk";
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
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onHighlight: (id: string) => void;
  onActionQuery: (query: string) => void;
  onAction: (id: string) => void;
  onFooter: (action: "primary" | "actions" | "back") => void;
};

const statusMarkup = (status: DemoStatus) => (
  <span id="status" role="status" data-error={status.error ? "true" : "false"}>
    {!status.error && status.stage !== "ready" && status.stage !== "info" ? (
      <span className="status-spinner" aria-hidden="true" />
    ) : null}
    {status.text}
  </span>
);

const Row = ({
  row,
  index,
  onSelect,
}: {
  row: RootRow;
  index: number;
  onSelect: (id: string) => void;
}) => (
  <Command.Item
    id={`root-option-${index}`}
    value={row.id}
    onSelect={() => onSelect(row.id)}
    className="root-item"
    data-root-index={index}
  >
    <span className="root-icon" aria-hidden="true">
      {row.iconUrl ? (
        <img
          src={row.iconUrl}
          alt=""
          width="24"
          height="24"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).hidden = true;
          }}
        />
      ) : (
        row.icon
      )}
    </span>
    <span className="root-copy">
      <strong>{row.title}</strong>
      <small>{row.subtitle}</small>
    </span>
    <span className="root-accessory">{row.accessory}</span>
    {row.unavailable ? (
      <span className="root-badge">
        {row.unavailable === "macos" ? "Needs macOS" : "Needs setup"}
      </span>
    ) : null}
  </Command.Item>
);

export function RootLauncher(props: RootLauncherProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.id = "root-search";
    inputRef.current?.focus();
    if (props.actionOpen)
      document
        .querySelector<HTMLInputElement>(".actions input[cmdk-input]")
        ?.setAttribute("id", "root-action-search");
  }, [props.actionOpen, props.query]);
  const rows = props.query.trim() ? props.rows : props.sections.flatMap((section) => section.rows);
  return (
    <Command
      shouldFilter={false}
      onValueChange={(value) => {
        props.onHighlight(value);
        requestAnimationFrame(() => {
          const item = document.querySelector<HTMLElement>(
            `.root-item[data-value="${CSS.escape(value)}"]`,
          );
          const list = document.querySelector<HTMLElement>(".root-options");
          if (item && list)
            list.scrollTop = Math.max(
              0,
              item.offsetTop - list.clientHeight + item.offsetHeight + 4,
            );
        });
      }}
      label="Extension commands"
    >
      <main className="root" data-kind="root" data-loading="false">
        <header>
          <h1>Blast</h1>
          <Command.Input
            ref={(node) => {
              inputRef.current = node;
              if (node) node.id = "root-search";
            }}
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
        >
          {props.query.trim() ? (
            <>
              {rows.map((row, index) => (
                <Row key={row.id} row={row} index={index} onSelect={props.onSelect} />
              ))}
            </>
          ) : (
            props.sections.map((section) => (
              <Command.Group key={section.title} heading={section.title} className="root-group">
                {section.rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    index={rows.findIndex((candidate) => candidate.id === row.id)}
                    onSelect={props.onSelect}
                  />
                ))}
              </Command.Group>
            ))
          )}
          <Command.Empty className="empty">No matching commands</Command.Empty>
        </Command.List>
        {props.actionOpen ? (
          <section className="actions" role="dialog" aria-label="Actions">
            <strong>Actions</strong>
            <Command.Input
              id="root-action-search"
              onValueChange={props.onActionQuery}
              placeholder="Search actions…"
              aria-label="Search actions"
            />
            <div id="root-actions" role="listbox">
              {props.actions.map((action, index) => (
                <button
                  type="button"
                  key={action.id}
                  role="option"
                  data-root-action-index={index}
                  onClick={() => props.onAction(action.id)}
                >
                  {action.title}
                  <small>{action.shortcut}</small>
                </button>
              ))}
              {props.actions.length === 0 ? <p>No matching actions</p> : null}
            </div>
          </section>
        ) : null}
        <footer>
          {statusMarkup(props.status)}
          <span className="footer-hints">
            <button
              type="button"
              className="footer-key"
              data-footer="primary"
              onClick={() => props.onFooter("primary")}
            >
              <span>Run Command</span>
              <kbd>↵</kbd>
            </button>
            <button
              type="button"
              className="footer-key"
              data-footer="actions"
              onClick={() => props.onFooter("actions")}
            >
              <span>Actions</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              type="button"
              className="footer-key"
              data-footer="back"
              onClick={() => props.onFooter("back")}
            >
              <span>Clear</span>
              <kbd>Esc</kbd>
            </button>
          </span>
          {props.toast ? (
            <span role="status" className="root-toast">
              {props.toast}
            </span>
          ) : null}
        </footer>
      </main>
    </Command>
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
