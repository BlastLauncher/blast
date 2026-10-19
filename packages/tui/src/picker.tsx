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
import {
  checkExtensionDependencies,
  installExtensionDependencies,
  defaultDataDir,
  createPreferenceStore,
  parsePreferences,
  type Preference,
  type StorageItems,
  type DependencyInstaller,
} from "@blastlauncher/host";
import { LaunchGate, PreferencesView } from "./preferences.tsx";
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
  dataDir: suppliedDataDir,
  installer,
  editPreferences,
  onPreferencesOpened,
}: {
  extensionDir: string;
  dataDir?: string;
  installer?: DependencyInstaller;
  editPreferences?: { command: string; scope: "extension" | "command" } | undefined;
  onPreferencesOpened?: () => void;
  /** Command name to select after returning from a launch. */
  initialSelection?: string | undefined;
  launching?: string | undefined;
  launchError?: string | undefined;
  onLaunch: (command: PickerCommand, values: Record<string, string>) => void;
  onQuit: () => void;
}) {
  const [dataDir] = useState(() => suppliedDataDir ?? defaultDataDir());
  const install = useRef<Promise<void>>(Promise.resolve());
  const [progress, setProgress] = useState<string>();
  const [installError, setInstallError] = useState<string>();
  const [launchGate, setLaunchGate] = useState<{
    command: PickerCommand;
    arguments: Record<string, string>;
    fields: Preference[];
    extensionFields: Preference[];
    initial: StorageItems;
  }>();
  const [preferencesView, setPreferencesView] = useState<{
    command: PickerCommand;
    extensionFields: Preference[];
    commandFields: Preference[];
    initial: StorageItems;
    scope?: "extension" | "command" | undefined;
  }>();
  const [preparing, setPreparing] = useState(false);

  const openPreferences = async (
    command: PickerCommand,
    scope?: "extension" | "command" | undefined,
  ) => {
    if (!manifest) return;
    try {
      const raw = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
      const extensionFields = parsePreferences(raw.preferences);
      const commandFields = parsePreferences(
        raw.commands.find((c: { name: string }) => c.name === command.name)?.preferences,
      );
      const store = createPreferenceStore({ extensionName: manifest.name, dataDir });
      const stored = await store.read();
      const initial =
        scope === "extension"
          ? stored.extension
          : { ...stored.extension, ...stored.commands[command.name] };
      setPreferencesView({
        command,
        extensionFields,
        commandFields,
        initial,
        scope,
      });
    } catch (error) {
      setManifestError(String(error));
    }
  };

  const prepare = async (command: PickerCommand, args: Record<string, string>) => {
    if (!manifest || preparing) return;
    setPreparing(true);
    try {
      await install.current;
      const raw = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
      const extensionFields = parsePreferences(raw.preferences);
      const commandFields = parsePreferences(
        raw.commands.find((c: { name: string }) => c.name === command.name)?.preferences,
      );
      const fields = [
        ...new Map([...extensionFields, ...commandFields].map((p) => [p.name, p])).values(),
      ];
      const store = createPreferenceStore({ extensionName: manifest.name, dataDir });
      const stored = await store.read();
      const initial = { ...stored.extension, ...stored.commands[command.name] };
      const missing = fields.filter(
        (p) =>
          p.required &&
          p.default === undefined &&
          (initial[p.name] === undefined || initial[p.name] === ""),
      );
      if (missing.length > 0) {
        setLaunchGate({
          command,
          arguments: args,
          fields: missing,
          extensionFields: extensionFields.filter(
            (p) => !commandFields.some((c) => c.name === p.name),
          ),
          initial,
        });
      } else {
        onLaunch(command, args);
      }
    } catch (error) {
      setManifestError(String(error));
    } finally {
      setPreparing(false);
    }
  };
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
    const refresh = () => {
      void read();
      // Serialize checks/installs: a manifest change during npm gets checked afterwards.
      install.current = install.current.then(async () => {
        if (!active) return;
        try {
          const options = { extensionDir, dataDir };
          const status = await checkExtensionDependencies(options);
          if (!status.needed || !active) return;
          setInstallError(undefined);
          setProgress("Installing dependencies…");
          await installExtensionDependencies({
            ...options,
            ...(installer ? { installer } : {}),
            onLog: (message) => {
              if (active) setProgress(message.trim().split(/\r?\n/).filter(Boolean).at(-1));
            },
          });
        } catch (error) {
          if (active) setInstallError(String(error));
        } finally {
          if (active) setProgress(undefined);
        }
      });
    };
    refresh();
    try {
      // Watch the directory: rewrites via rename would strand a file watcher.
      watcher = watch(extensionDir, (_event, file) => {
        if (file && file !== "package.json" && file !== "package-lock.json") return;
        clearTimeout(timer);
        timer = setTimeout(refresh, WATCH_DEBOUNCE_MS);
      });
    } catch {
      // Watching is best-effort; the list just stays as it was.
    }
    return () => {
      active = false;
      clearTimeout(timer);
      watcher?.close();
    };
  }, [extensionDir, dataDir, installer]);
  useEffect(() => {
    const command = manifest?.commands.find((c) => c.name === editPreferences?.command);
    if (command) void openPreferences(command, editPreferences?.scope).finally(onPreferencesOpened);
  }, [manifest, editPreferences]);
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
    if (launchGate || preferencesView) return;
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
        void prepare(form, values);
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
    if (key.ctrl && key.name === "e" && chosen) {
      key.preventDefault();
      void openPreferences(chosen);
      return;
    }
    if (key.name === "return" && chosen) {
      key.preventDefault();
      if (chosen.arguments.length) openForm(chosen);
      else void prepare(chosen, {});
    }
  });
  const fieldAt = form ? Math.min(fieldIndex, form.arguments.length - 1) : -1;
  return (
    <box flexDirection="column" height="100%" padding={1}>
      <text height={1} flexShrink={0}>
        {manifest?.title ?? extensionDir}
        {manifest ? "" : "  Loading…"}
      </text>
      {preferencesView ? (
        <PreferencesView
          extensionTitle={manifest?.title ?? extensionDir}
          commandTitle={preferencesView.command.title}
          extensionFields={preferencesView.extensionFields}
          commandFields={preferencesView.commandFields}
          scope={preferencesView.scope}
          initial={preferencesView.initial}
          onCancel={() => setPreferencesView(undefined)}
          onSave={async (saved) => {
            const isExtension = (name: string) =>
              preferencesView.scope === "extension"
                ? true
                : preferencesView.extensionFields.some((p) => p.name === name) &&
                  !preferencesView.commandFields.some((c) => c.name === name);
            await createPreferenceStore({ extensionName: manifest!.name, dataDir }).save(
              Object.fromEntries(Object.entries(saved).filter(([name]) => isExtension(name))),
              preferencesView.command.name,
              Object.fromEntries(Object.entries(saved).filter(([name]) => !isExtension(name))),
            );
            setPreferencesView(undefined);
          }}
        />
      ) : launchGate ? (
        <LaunchGate
          commandTitle={launchGate.command.title}
          fields={launchGate.fields}
          initial={launchGate.initial}
          onCancel={() => {
            setLaunchGate(undefined);
            setForm(undefined);
          }}
          onSave={async (saved) => {
            const isExtension = (name: string) =>
              launchGate.extensionFields.some((p) => p.name === name);
            await createPreferenceStore({ extensionName: manifest!.name, dataDir }).save(
              Object.fromEntries(Object.entries(saved).filter(([name]) => isExtension(name))),
              launchGate.command.name,
              Object.fromEntries(Object.entries(saved).filter(([name]) => !isExtension(name))),
            );
            setLaunchGate(undefined);
            setForm(undefined);
            onLaunch(launchGate.command, launchGate.arguments);
          }}
        />
      ) : form ? (
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
      {progress && (
        <text height={1} flexShrink={0}>
          Dependencies: {progress}
        </text>
      )}
      {installError && (
        <text height={1} flexShrink={0}>
          Install failed: {installError}
        </text>
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
          : "↑↓ Select · Enter Launch · Type to Filter · Ctrl-E Preferences · Esc Quit"}
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
  installer,
  onExit,
}: {
  extensionDir: string;
  dataDir?: string;
  hudDurationMs?: number;
  installer?: DependencyInstaller;
  onExit?: (crashed: boolean) => void;
}) {
  const [resolvedDataDir] = useState(() => dataDir ?? defaultDataDir());
  const [editPreferences, setEditPreferences] = useState<{
    command: string;
    scope: "extension" | "command";
  }>();
  const [active, setActive] = useState<{
    command: string;
    opened: OpenedCommand;
    /** Set before we close the session, so our own shutdown is not a crash. */
    closing: { value: boolean };
  }>();
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
          dataDir: resolvedDataDir,
          handlers: {
            "preferences.open": (params) => {
              if (
                !params ||
                typeof params !== "object" ||
                Array.isArray(params) ||
                (params.scope !== "extension" && params.scope !== "command")
              )
                throw new Error("Invalid preferences scope");
              const scope = params.scope;
              setTimeout(() => {
                leave();
                setEditPreferences({ command: command.name, scope });
              }, 0);
            },
          },
          argumentValues: values,
        });
        if (exiting.current) {
          void opened.close();
          return;
        }
        crashed.current = false;
        const closing = { value: false };
        void opened.session.exited.then((exit) => {
          if (!closing.value && (exit.error || exit.code !== 0)) crashed.current = true;
        });
        setLaunching(undefined);
        setActive({ command: command.name, opened, closing });
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
    current.closing.value = true;
    void current.opened.close();
  }
  function quit() {
    if (exiting.current) return;
    exiting.current = true;
    void (async () => {
      const current = latest.current.active;
      setActive(undefined);
      // A crash was recorded when the child exited; a runtime that ignores
      // our shutdown and gets killed is not reported as a crash.
      if (current) {
        current.closing.value = true;
        await current.opened.close();
      }
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
      dataDir={resolvedDataDir}
      {...(installer ? { installer } : {})}
      editPreferences={editPreferences}
      onPreferencesOpened={() => setEditPreferences(undefined)}
      initialSelection={lastCommand}
      launching={launching}
      launchError={launchError}
      onLaunch={launch}
      onQuit={quit}
    />
  );
}
