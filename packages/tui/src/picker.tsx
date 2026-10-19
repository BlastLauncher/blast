/** @jsxImportSource @opentui/react */
import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  commandRow,
  filterCommands,
  missingRequired,
  parseManifest,
  type Manifest,
  type PickerArgument,
  type PickerCommand,
} from "./picker.ts";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";

const WATCH_DEBOUNCE_MS = 100;

/**
 * The picker view: lists the manifest's commands, filters by typed text and
 * opens the argument form. The manifest is re-read while open (debounced
 * fs.watch); a broken manifest shows an inline error and keeps the last good
 * list. Launch errors arrive as the `launching`/`launchError` props so the
 * picker keeps its own state across a failed launch.
 */
export function CommandPicker({
  extensionDir,
  initialSelection,
  launching,
  launchError,
  onLaunch,
  onQuit,
}: {
  extensionDir: string;
  /** Command name to select after returning from a launch. */
  initialSelection?: string | undefined;
  launching?: string | undefined;
  launchError?: string | undefined;
  onLaunch: (command: PickerCommand, values: Record<string, string>) => void;
  onQuit: () => void;
}) {
  const [manifest, setManifest] = useState<Manifest>();
  const [manifestError, setManifestError] = useState<string>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initialSelection);
  const [form, setForm] = useState<PickerCommand>();
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let active = true;
    let watcher: FSWatcher | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const parsed = parseManifest(
          JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8")),
        );
        if (!active) return;
        setManifest(parsed);
        setManifestError(undefined);
      } catch (error) {
        if (!active) return;
        setManifestError(error instanceof Error ? error.message : String(error));
      }
    };
    void read();
    try {
      // Watch the directory: rewrites via rename would strand a file watcher.
      watcher = watch(extensionDir, (_event, file) => {
        if (file && file !== "package.json") return;
        clearTimeout(timer);
        timer = setTimeout(() => void read(), WATCH_DEBOUNCE_MS);
      });
    } catch {
      // Watching is best-effort; the list just stays as it was.
    }
    return () => {
      active = false;
      clearTimeout(timer);
      watcher?.close();
    };
  }, [extensionDir]);
  const rows = filterCommands(manifest?.commands ?? [], query);
  const chosen = rows.find((command) => command.name === selected) ?? rows[0];
  const openForm = (command: PickerCommand) => {
    setForm(command);
    setFieldIndex(0);
    setBlocked(false);
    // A dropdown starts on its first option, like the List accessory.
    setValues(
      Object.fromEntries(
        command.arguments
          .filter((argument) => argument.type === "dropdown")
          .map((argument) => [argument.name, argument.data[0]?.value ?? ""]),
      ),
    );
  };
  const setValue = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setBlocked(false);
  };
  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      onQuit();
      return;
    }
    if (form) {
      const args = form.arguments;
      const field = args[Math.min(fieldIndex, args.length - 1)];
      const move = (delta: number) => {
        key.preventDefault();
        setFieldIndex(Math.max(0, Math.min(args.length - 1, fieldIndex + delta)));
      };
      if (key.name === "escape") {
        key.preventDefault();
        setForm(undefined);
      } else if (key.name === "tab" || key.name === "up" || key.name === "down") {
        move(key.name === "up" || (key.name === "tab" && key.shift) ? -1 : 1);
      } else if (field?.type === "dropdown" && (key.name === "left" || key.name === "right")) {
        key.preventDefault();
        const at = field.data.findIndex((option) => option.value === values[field.name]);
        const next =
          field.data[
            Math.max(0, Math.min(field.data.length - 1, at + (key.name === "right" ? 1 : -1)))
          ];
        if (next) setValue(field.name, next.value);
      } else if (field?.type === "password") {
        if (key.ctrl || key.meta || key.option) return;
        const current = values[field.name] ?? "";
        if (key.name === "backspace") {
          key.preventDefault();
          setValue(field.name, current.slice(0, -1));
        } else if (
          key.sequence &&
          Array.from(key.sequence).every(
            (char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127,
          )
        ) {
          key.preventDefault();
          setValue(field.name, current + key.sequence);
        }
      } else if (key.name === "return") {
        key.preventDefault();
        if (missingRequired(args, values).length) {
          setBlocked(true);
          return;
        }
        setForm(undefined);
        onLaunch(form, values);
      }
      return;
    }
    if (key.name === "escape") {
      key.preventDefault();
      onQuit();
      return;
    }
    if (key.name === "up" || key.name === "down") {
      key.preventDefault();
      const at = rows.findIndex((command) => command.name === chosen?.name);
      const next =
        rows[Math.max(0, Math.min(rows.length - 1, at + (key.name === "down" ? 1 : -1)))];
      if (next) setSelected(next.name);
      return;
    }
    if (key.name === "return" && chosen) {
      key.preventDefault();
      if (chosen.arguments.length) openForm(chosen);
      else onLaunch(chosen, {});
    }
  });
  const fieldAt = form ? Math.min(fieldIndex, form.arguments.length - 1) : -1;
  return (
    <box flexDirection="column" height="100%" padding={1}>
      <text height={1} flexShrink={0}>
        {manifest?.title ?? extensionDir}
        {manifest ? "" : "  Loading…"}
      </text>
      {form ? (
        <box flexDirection="column" flexGrow={1} flexShrink={0}>
          <text height={1} flexShrink={0}>
            Launch {form.title}
          </text>
          {form.arguments.map((argument, index) => (
            <ArgumentField
              key={argument.name}
              argument={argument}
              active={index === fieldAt}
              value={values[argument.name] ?? ""}
              onInput={(value) => setValue(argument.name, value)}
            />
          ))}
          {blocked && (
            <text height={1} flexShrink={0}>
              Required: {missingRequired(form.arguments, values).join(", ")}
            </text>
          )}
        </box>
      ) : (
        <>
          <box flexDirection="row" flexShrink={0}>
            <input
              flexGrow={1}
              focused
              value={query}
              placeholder="Search commands…"
              onInput={(value) => setQuery(value)}
            />
          </box>
          <box flexDirection="row" flexGrow={1}>
            <scrollbox flexGrow={1}>
              {rows.map((row) => (
                <text
                  key={row.name}
                  height={1}
                  flexShrink={0}
                  {...(row.name === chosen?.name ? { bg: "#234567" } : {})}
                >
                  {row.name === chosen?.name ? "› " : "  "}
                  {commandRow(row)}
                </text>
              ))}
              {manifest && rows.length === 0 && <text>No matching commands</text>}
            </scrollbox>
          </box>
        </>
      )}
      {manifestError && (
        <text height={1} flexShrink={0}>
          Manifest: {manifestError}
        </text>
      )}
      {launchError && (
        <text height={1} flexShrink={0}>
          Launch failed: {launchError}
        </text>
      )}
      {launching && (
        <text height={1} flexShrink={0}>
          Launching {launching}…
        </text>
      )}
      <text height={1} flexShrink={0}>
        {form
          ? "Tab/↑↓ Fields · ←→ Options · Enter Launch · Esc Cancel"
          : "↑↓ Select · Enter Launch · Type to Filter · Esc Quit"}
      </text>
    </box>
  );
}

function ArgumentField({
  argument,
  active,
  value,
  onInput,
}: {
  argument: PickerArgument;
  active: boolean;
  value: string;
  onInput: (value: string) => void;
}) {
  const marker = active ? "› " : "  ";
  const label = `${argument.name}${argument.required ? " *" : ""}`;
  if (argument.type === "dropdown") {
    const current = argument.data.find((option) => option.value === value) ?? argument.data[0];
    return (
      <text height={1} flexShrink={0}>
        {marker}
        {label} {current ? `‹ ${current.title} ›` : "(no options)"}
      </text>
    );
  }
  if (argument.type === "password") {
    return (
      <text height={1} flexShrink={0}>
        {marker}
        {label} {value ? "••••••••" : argument.placeholder}
      </text>
    );
  }
  return (
    <box flexDirection="column" flexShrink={0}>
      <text height={1} flexShrink={0}>
        {marker}
        {label}
      </text>
      {active ? (
        <input
          focused
          value={value}
          placeholder={argument.placeholder || argument.name}
          onInput={onInput}
        />
      ) : (
        <text height={1} flexShrink={0}>
          {value || argument.placeholder || argument.name}
        </text>
      )}
    </box>
  );
}

type OpenedCommand = Awaited<ReturnType<typeof openCommand>>;

/**
 * The picker-mode session: picker and launched commands share the terminal.
 * Esc at a command's root, a no-view command finishing and the crash error
 * screen all close the session and return to the picker (selection kept);
 * Ctrl-C quits the whole TUI from anywhere. The process exits 1 only when
 * the last launched command crashed and the user then quits.
 */
export function CommandSession({
  extensionDir,
  dataDir,
  hudDurationMs,
  onExit,
}: {
  extensionDir: string;
  dataDir?: string;
  hudDurationMs?: number;
  onExit?: (crashed: boolean) => void;
}) {
  const [active, setActive] = useState<{ command: string; opened: OpenedCommand }>();
  const [launching, setLaunching] = useState<string>();
  const [launchError, setLaunchError] = useState<string>();
  const [lastCommand, setLastCommand] = useState<string>();
  const crashed = useRef(false);
  const exiting = useRef(false);
  const latest = useRef({ active, launching });
  latest.current = { active, launching };
  useEffect(
    () => () => {
      // Unmount without a normal quit (SIGTERM during launch) cleans up.
      const current = latest.current.active;
      if (current) void current.opened.close();
    },
    [],
  );
  function launch(command: PickerCommand, values: Record<string, string>) {
    if (exiting.current || latest.current.launching || latest.current.active) return;
    setLaunchError(undefined);
    setLaunching(command.name);
    void (async () => {
      try {
        const opened = await openCommand(extensionDir, command.name, {
          ...(dataDir === undefined ? {} : { dataDir }),
          argumentValues: values,
        });
        if (exiting.current) {
          void opened.close();
          return;
        }
        crashed.current = false;
        void opened.session.exited.then((exit) => {
          if (exit.error || exit.code !== 0) crashed.current = true;
        });
        setLaunching(undefined);
        setActive({ command: command.name, opened });
      } catch (error) {
        setLaunching(undefined);
        setLaunchError(error instanceof Error ? error.message : String(error));
      }
    })();
  }
  function leave() {
    const current = latest.current.active;
    if (!current) return;
    setLastCommand(current.command);
    setActive(undefined);
    void current.opened.close();
  }
  function quit() {
    if (exiting.current) return;
    exiting.current = true;
    void (async () => {
      const current = latest.current.active;
      setActive(undefined);
      // close() awaits the runtime's shutdown, by which time a crashed
      // child's `exited` promise (tracked above) has recorded the crash.
      if (current) await current.opened.close();
      onExit?.(crashed.current);
    })();
  }
  if (active)
    return (
      <App
        session={active.opened.session}
        onQuit={leave}
        onExit={quit}
        {...(hudDurationMs === undefined ? {} : { hudDurationMs })}
      />
    );
  return (
    <CommandPicker
      extensionDir={extensionDir}
      initialSelection={lastCommand}
      launching={launching}
      launchError={launchError}
      onLaunch={launch}
      onQuit={quit}
    />
  );
}
