import { useState } from "react";
import { Action, ActionPanel, Form } from "@raycast/api";
import { query, sessionTarget, target, tmux, useLoad, windowTarget } from "./tmux.ts";

async function sessionExists(name: string): Promise<boolean> {
  return query(["has-session", "-t", `=${name}`]).then(
    () => true,
    () => false,
  );
}

/** A one-field form prefilled with the current name; submit renames. */
function RenameForm(props: {
  title: string;
  load: () => Promise<string>;
  rename: (name: string) => string[];
  check?: (name: string, current: string) => Promise<string | undefined>;
}) {
  const current = useLoad(props.load);
  const [typed, setTyped] = useState<string>();
  const [error, setError] = useState<string>();
  const name = typed ?? current ?? "";
  return (
    <Form
      isLoading={current === undefined}
      navigationTitle={props.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={props.title}
            onSubmit={async () => {
              if (current === undefined) return;
              const problem = await props.check?.(name, current);
              if (problem) setError(problem);
              else await tmux(props.rename(name));
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        value={name}
        error={error}
        onChange={(next) => {
          setTyped(next);
          setError(undefined);
        }}
      />
    </Form>
  );
}

const required = async (name: string) => (name.trim() ? undefined : "Enter a name");

export function RenamePaneForm() {
  return (
    <RenameForm
      title="Rename Pane"
      load={() => query(["display-message", "-p", "-t", target(), "#{pane_title}"])}
      rename={(name) => ["select-pane", "-t", target(), "-T", name]}
    />
  );
}

export function RenameWindowForm() {
  return (
    <RenameForm
      title="Rename Window"
      load={() => query(["display-message", "-p", "-t", windowTarget(), "#{window_name}"])}
      rename={(name) => ["rename-window", "-t", windowTarget(), name]}
      check={required}
    />
  );
}

export function RenameSessionForm({ session = sessionTarget() }: { session?: string }) {
  return (
    <RenameForm
      title="Rename Session"
      load={() => query(["display-message", "-p", "-t", session, "#{session_name}"])}
      rename={(name) => ["rename-session", "-t", session, name]}
      check={async (name, current) =>
        (await required(name)) ??
        (name !== current && (await sessionExists(name))
          ? `Session ${name} already exists`
          : undefined)
      }
    />
  );
}

export function NewSessionForm() {
  const [error, setError] = useState<string>();
  return (
    <Form
      navigationTitle="New Session"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Session"
            onSubmit={async (values: { name?: string; directory?: string }) => {
              const name = values.name ?? "";
              const problem =
                (await required(name)) ??
                ((await sessionExists(name)) ? `Session ${name} already exists` : undefined);
              if (problem) return setError(problem);
              const directory = values.directory?.trim();
              await tmux([
                "new-session",
                "-d",
                "-s",
                name,
                ...(directory ? ["-c", directory] : []),
                ";",
                "switch-client",
                "-t",
                `=${name}`,
              ]);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" error={error} onChange={() => setError(undefined)} />
      <Form.TextField id="directory" title="Start Directory" placeholder="Optional" />
    </Form>
  );
}
