/** @jsxImportSource @opentui/react */
import { createHeadlessHandlers } from "@blastlauncher/cli";
import { useEffect, useRef, useState } from "react";
import { useKeyboard, usePaste } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { filterCommands, modeLabel } from "./picker.ts";
import {
  openExtension,
  defaultDataDir,
  missingRequired,
  type ExtensionHandle,
  type ExtensionManifest as Manifest,
  type ExtensionArgument as PickerArgument,
  type ExtensionCommand as PickerCommand,
  type Preference,
  type StorageItems,
  type DependencyInstaller,
} from "@blastlauncher/host";
import { LaunchGate, PreferencesView } from "./preferences.tsx";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";
import { theme } from "./theme.ts";
import { pastedText } from "./paste.ts";

/**
 * The picker view: lists the manifest's commands, filters by typed text and
 * opens the argument form. The manifest is re-read while open (debounced
 * host reload); a broken manifest shows an inline error and keeps the last good
 * list. Launch errors arrive as the `launching`/`launchError` props so the
 * picker keeps its own state across a failed launch.
 */
export function CommandPicker({
  extensionDir,
  dataDir: suppliedDataDir,
  extension: suppliedExtension,
  installer,
  editPreferences,
  onPreferencesOpened,
  initialSelection,
  launching,
  launchError,
  onLaunch,
  onQuit,
}: {
  extensionDir: string;
  extension?: ExtensionHandle;
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
  const [extension] = useState(
    () =>
      suppliedExtension ??
      openExtension({
        handlers: createHeadlessHandlers(),
        extensionDir,
        ...(suppliedDataDir === undefined ? {} : { dataDir: suppliedDataDir }),
        ...(installer ? { installer } : {}),
      }),
  );
  const install = useRef<Promise<void>>(Promise.resolve());
  const [progress, setProgress] = useState<string>();
  const [installError, setInstallError] = useState<string>();
  const [launchGate, setLaunchGate] = useState<{
    command: PickerCommand;
    arguments: Record<string, string>;
    fields: Preference[];
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
      const prefs = await extension.preferences(command.name, scope);
      const extensionFields = prefs.extension;
      const commandFields = prefs.command;
      const initial = prefs.values;
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
      const prefs = await extension.preferences(command.name);
      const initial = prefs.values;
      const missing = prefs.missing;
      if (missing.length > 0) {
        setLaunchGate({
          command,
          arguments: args,
          fields: missing,
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
    const refreshDependencies = () => {
      install.current = (async () => {
        try {
          const status = await extension.dependencies.check();
          if (!status.needed || !active) return;
          setInstallError(undefined);
          setProgress("Installing dependencies…");
          await extension.dependencies.install({
            onLog: (message) => {
              if (active) setProgress(message.trim().split(/\r?\n/).filter(Boolean).at(-1));
            },
          });
        } catch (error) {
          if (active) setInstallError(String(error));
        } finally {
          if (active) setProgress(undefined);
        }
      })();
    };
    const update = (value: Manifest | Error) => {
      if (!active) return;
      if (value instanceof Error) setManifestError(value.message);
      else {
        setManifest(value);
        setManifestError(undefined);
      }
      refreshDependencies();
    };
    void extension.manifest().then(update, (error: Error) => update(error));
    // Keep watcher ownership in the host handle; unavailable watching is best-effort.
    let unsubscribe: (() => void) | undefined;
    try {
      const subscribe = extension.watch;
      unsubscribe = subscribe(update);
    } catch {
      /* The initial manifest remains usable without watching. */
    }
    return () => {
      active = false;
      unsubscribe?.();
      if (!suppliedExtension) void extension.close();
    };
  }, [extension]);
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
  usePaste((paste) => {
    if (launchGate || preferencesView || !form) return;
    const field = form.arguments[Math.min(fieldIndex, form.arguments.length - 1)];
    if (field?.type !== "password") return;
    // Terminals deliver pastes as one bracketed event, not key presses.
    paste.preventDefault();
    const text = pastedText(paste);
    setValues((current) => ({ ...current, [field.name]: (current[field.name] ?? "") + text }));
    setBlocked(false);
  });
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
      } else if (field?.type === "password" && key.name !== "return") {
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
  let statusText = "";
  let statusColor: string = theme.colors.textMuted;
  if (manifestError) {
    statusText = `Manifest: ${manifestError}`;
    statusColor = theme.colors.danger;
  } else if (installError) {
    statusText = `Install failed: ${installError}`;
    statusColor = theme.colors.danger;
  } else if (launchError) {
    statusText = `Launch failed: ${launchError}`;
    statusColor = theme.colors.danger;
  } else if (progress) {
    statusText = `Dependencies: ${progress}`;
    statusColor = theme.colors.textMuted;
  } else if (launching) {
    statusText = `Launching ${launching}…`;
    statusColor = theme.colors.textMuted;
  }

  return (
    <box
      flexDirection="column"
      height="100%"
      width="100%"
      borderStyle="rounded"
      borderColor={theme.colors.border}
      title={manifest?.title ?? extensionDir}
      backgroundColor={theme.colors.background}
    >
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
            await extension.savePreferences(
              preferencesView.command.name,
              saved,
              preferencesView.scope,
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
            await extension.savePreferences(launchGate.command.name, saved);
            setLaunchGate(undefined);
            setForm(undefined);
            onLaunch(launchGate.command, launchGate.arguments);
          }}
        />
      ) : form ? (
        <box flexDirection="column" flexGrow={1} flexShrink={0} paddingLeft={1} paddingRight={1}>
          <text height={1} flexShrink={0} fg={theme.colors.textMuted}>
            Launch {form.title}
          </text>
          <box
            height={1}
            flexShrink={0}
            border={["top"]}
            borderStyle="single"
            borderColor={theme.colors.border}
          />
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
            <text height={1} flexShrink={0} fg={theme.colors.danger}>
              Required: {missingRequired(form.arguments, values).join(", ")}
            </text>
          )}
        </box>
      ) : (
        <>
          <box flexDirection="row" height={1} flexShrink={0} paddingLeft={1} paddingRight={1}>
            <text flexShrink={0} fg={theme.colors.accent}>
              {theme.glyphs.search}{" "}
            </text>
            <input
              flexGrow={1}
              focused
              value={query}
              placeholder="Search commands…"
              placeholderColor={theme.colors.textMuted}
              textColor={theme.colors.text}
              onInput={(value) => setQuery(value)}
            />
          </box>
          <box
            height={1}
            flexShrink={0}
            border={["top"]}
            borderStyle="single"
            borderColor={theme.colors.border}
          />
          <box flexDirection="row" flexGrow={1} paddingLeft={1} paddingRight={1}>
            <scrollbox flexGrow={1}>
              {rows.map((row) => {
                const isSelected = row.name === chosen?.name;
                const subtitle = row.subtitle || row.description;
                return (
                  <box
                    key={row.name}
                    id={row.name}
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
                    {subtitle ? (
                      <text
                        flexShrink={1}
                        wrapMode="none"
                        fg={theme.colors.textMuted}
                        {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                      >
                        {`  ${subtitle}`}
                      </text>
                    ) : null}
                    <box
                      flexGrow={1}
                      flexShrink={0}
                      {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                    />
                    <text
                      flexShrink={0}
                      wrapMode="none"
                      fg={theme.colors.textMuted}
                      {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
                    >
                      {modeLabel(row.mode)}
                    </text>
                  </box>
                );
              })}
              {manifest && rows.length === 0 && (
                <text fg={theme.colors.textMuted}>No matching commands</text>
              )}
            </scrollbox>
          </box>
        </>
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
        <text flexGrow={1} flexShrink={1} wrapMode="none" fg={statusColor}>
          {statusText}
        </text>
        <text flexShrink={0} wrapMode="none">
          <span fg={theme.colors.text}>Launch</span>
          <span fg={theme.colors.textMuted}>{` ${theme.glyphs.enter}  `}</span>
          <span fg={theme.colors.text}>Preferences</span>
          <span fg={theme.colors.textMuted}>{` ^E  `}</span>
          <span fg={theme.colors.text}>Quit</span>
          <span fg={theme.colors.textMuted}>{` esc`}</span>
        </text>
      </box>
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
      <box
        flexDirection="row"
        width="100%"
        height={1}
        flexShrink={0}
        {...(active ? { backgroundColor: theme.colors.selectionBg } : {})}
      >
        <text
          width={18}
          height={1}
          flexShrink={0}
          textAlign="right"
          fg={theme.colors.textMuted}
          wrapMode="none"
        >
          {marker}
          {label}{" "}
        </text>
        <text height={1} fg={active ? theme.colors.selectionFg : theme.colors.text}>
          {current ? `‹ ${current.title} ›` : "(no options)"}
        </text>
      </box>
    );
  }
  if (argument.type === "password") {
    return (
      <box
        flexDirection="row"
        width="100%"
        height={1}
        flexShrink={0}
        {...(active ? { backgroundColor: theme.colors.selectionBg } : {})}
      >
        <text
          width={18}
          height={1}
          flexShrink={0}
          textAlign="right"
          fg={theme.colors.textMuted}
          wrapMode="none"
        >
          {marker}
          {label}{" "}
        </text>
        <text height={1} fg={active ? theme.colors.selectionFg : theme.colors.text}>
          {value ? "••••••••" : argument.placeholder || "(empty)"}
        </text>
      </box>
    );
  }
  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
      flexShrink={0}
      {...(active ? { backgroundColor: theme.colors.selectionBg } : {})}
    >
      <text
        width={18}
        height={1}
        flexShrink={0}
        textAlign="right"
        fg={theme.colors.textMuted}
        wrapMode="none"
      >
        {marker}
        {label}{" "}
      </text>
      <box flexGrow={1} flexShrink={1}>
        {active ? (
          <input
            focused
            value={value}
            placeholder={argument.placeholder || argument.name}
            placeholderColor={theme.colors.textMuted}
            textColor={theme.colors.selectionFg}
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            onInput={onInput}
          />
        ) : (
          <text height={1} fg={theme.colors.text}>
            {value || argument.placeholder || argument.name}
          </text>
        )}
      </box>
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
  const [extension] = useState(() =>
    openExtension({
      handlers: createHeadlessHandlers(),
      extensionDir,
      dataDir: resolvedDataDir,
      ...(installer ? { installer } : {}),
    }),
  );
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
      void extension.close();
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
          extension,
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
      extension={extension}
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
