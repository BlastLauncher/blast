import { useCallback, useEffect, useState } from "react";

import type { CoreClientSnapshot } from "@blastlauncher/client";
import type { CommandIdentity } from "@blastlauncher/core";
import type { SceneFormValues, ToastPayload } from "@blastlauncher/scene";

import type { V2ClientRendererAPI } from "./v2Types";

import { V2Scene } from "./V2Scene";

export interface V2AppProps {
  readonly api: V2ClientRendererAPI;
}

export function V2App({ api }: V2AppProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<CoreClientSnapshot | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [toasts, setToasts] = useState<readonly ToastPayload[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribeSnapshot = api.subscribeSnapshots((next) => {
      if (!mounted) {
        return;
      }
      setSnapshot(next);
      if (next.error === undefined) {
        setFailure(undefined);
      }
    });
    const unsubscribeToast = api.subscribeToasts((toast) => {
      if (mounted) {
        setToasts((current) => [...current, toast].slice(-3));
      }
    });

    void api.start().then(
      (initial) => {
        if (mounted) {
          setSnapshot(initial);
        }
      },
      (error: unknown) => {
        if (mounted) {
          setFailure(describeError(error));
        }
      },
    );

    return () => {
      mounted = false;
      unsubscribeSnapshot();
      unsubscribeToast();
    };
  }, [api]);

  const perform = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await operation();
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const runCommand = useCallback(
    (identity: CommandIdentity) => perform(() => api.runCommand(identity)),
    [api, perform],
  );
  const stopCommand = useCallback(() => perform(() => api.stopCommand("Stopped by user")), [api, perform]);
  const refreshCommands = useCallback(
    () =>
      perform(async () => {
        await api.refreshCommands();
      }),
    [api, perform],
  );
  const sendSceneEvent = useCallback(
    async (eventId: string, values?: SceneFormValues): Promise<void> => {
      try {
        await api.sendSceneEvent(eventId, values);
      } catch (error) {
        setFailure(describeError(error));
        throw error;
      }
    },
    [api],
  );

  const snapshotFailure = snapshot?.error?.message;

  return (
    <div className="h-full dark text-white flex flex-col bg-[var(--app-bg)]">
      <header className="drag-area flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">Blast V2</div>
          <div className="text-xs text-white/50 truncate">
            {snapshot === undefined ? "Connecting to core…" : describeState(snapshot)}
          </div>
        </div>
        {snapshot?.activeCommand !== undefined && (
          <button
            className="no-drag rounded-md px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 disabled:opacity-50"
            disabled={busy}
            onClick={() => void stopCommand()}
            type="button"
          >
            Stop
          </button>
        )}
        {snapshot?.activeCommand === undefined && (
          <button
            className="no-drag rounded-md px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 disabled:opacity-50"
            disabled={busy || snapshot === undefined}
            onClick={() => void refreshCommands()}
            type="button"
          >
            Refresh
          </button>
        )}
        <button
          aria-label="Close window"
          className="no-drag rounded-md px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => window.electron.closeWindow()}
          type="button"
        >
          ×
        </button>
      </header>

      {(failure !== undefined || snapshotFailure !== undefined) && (
        <div className="mx-4 mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-100">
          {failure ?? snapshotFailure}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-4">
        {snapshot === undefined ? (
          <LoadingState />
        ) : snapshot.activeCommand === undefined ? (
          <CommandList commands={snapshot.commands} disabled={busy} onRun={runCommand} />
        ) : snapshot.scene === undefined ? (
          <LoadingState label={snapshot.state === "stopping" ? "Stopping command…" : "Starting command…"} />
        ) : (
          <V2Scene
            disabled={busy}
            key={`${snapshot.activeCommand.extensionId}:${snapshot.activeCommand.commandName}`}
            onEvent={sendSceneEvent}
            root={snapshot.scene}
          />
        )}
      </main>

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 flex max-w-[20rem] flex-col gap-2">
          {toasts.map((toast, index) => (
            <div className="rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs shadow-lg" key={index}>
              {toast.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandList({
  commands,
  disabled,
  onRun,
}: {
  readonly commands: CoreClientSnapshot["commands"];
  readonly disabled: boolean;
  readonly onRun: (identity: CommandIdentity) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCommands = commands.filter((command) => {
    if (normalizedQuery.length === 0) {
      return true;
    }
    return [command.title, command.extensionName, command.extensionId, command.commandName]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold">Commands</h1>
        <p className="text-sm text-white/50">Choose a command from the trusted V2 catalog.</p>
      </div>
      <input
        autoFocus
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search commands…"
        value={query}
      />
      <div className="flex flex-col gap-2">
        {visibleCommands.map((command) => (
          <button
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10 disabled:opacity-50"
            disabled={disabled}
            key={`${command.extensionId}:${command.commandName}`}
            onClick={() => onRun({ extensionId: command.extensionId, commandName: command.commandName })}
            type="button"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-400/20 text-sm text-blue-100">
              {firstLetter(command.title ?? command.commandName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{command.title ?? command.commandName}</span>
              <span className="block truncate text-xs text-white/50">
                {command.extensionName ?? command.extensionId} · {command.commandName}
              </span>
            </span>
            <span className="text-white/30">›</span>
          </button>
        ))}
        {visibleCommands.length === 0 && (
          <div className="py-10 text-center text-sm text-white/50">No commands found.</div>
        )}
      </div>
    </section>
  );
}

function LoadingState({ label = "Loading V2 client…" }: { readonly label?: string }): React.JSX.Element {
  return <div className="flex h-full items-center justify-center text-sm text-white/50">{label}</div>;
}

function describeState(snapshot: CoreClientSnapshot): string {
  if (snapshot.activeCommand === undefined) {
    return `${snapshot.commands.length} command${snapshot.commands.length === 1 ? "" : "s"}`;
  }
  return `${snapshot.activeCommand.extensionId} · ${snapshot.activeCommand.commandName} · ${snapshot.state}`;
}

function describeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function firstLetter(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "?";
}
