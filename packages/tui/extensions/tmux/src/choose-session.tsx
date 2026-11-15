import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { NewSessionForm, RenameSessionForm } from "./forms.tsx";
import { confirmDestructive, rows, tmux, useLoad } from "./tmux.ts";

const fields = {
  id: "#{session_id}",
  name: "#{session_name}",
  windows: "#{session_windows}",
  attached: "#{session_attached}",
};

export default function Command() {
  const sessions = useLoad(() => rows(["list-sessions"], fields));
  const create = (
    <Action.Push
      title="New Session"
      icon={Icon.Plus}
      target={<NewSessionForm />}
      shortcut={{ modifiers: ["cmd"], key: "n" }}
    />
  );
  return (
    <List isLoading={sessions === undefined} searchBarPlaceholder="Choose a session">
      {sessions?.map((session) => (
        <List.Item
          key={session.id}
          title={session.name}
          accessories={[
            { text: `${session.windows} ${session.windows === "1" ? "window" : "windows"}` },
            ...(session.attached === "0" ? [] : [{ tag: "attached" }]),
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Switch to Session"
                icon={Icon.ArrowRight}
                onAction={() => tmux(["switch-client", "-t", session.id])}
              />
              <Action.Push
                title="Rename Session"
                icon={Icon.Pencil}
                target={<RenameSessionForm session={session.id} />}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
              />
              {create}
              <Action
                title="Kill Session"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={async () => {
                  if (await confirmDestructive("kill-session")) {
                    await tmux(["kill-session", "-t", session.id]);
                  }
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
