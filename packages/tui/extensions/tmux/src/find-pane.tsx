import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { confirmDestructive, rows, tmux, useLoad } from "./tmux.ts";

const fields = {
  id: "#{pane_id}",
  session: "#{session_name}",
  window: "#{window_index}",
  windowName: "#{window_name}",
  pane: "#{pane_index}",
  title: "#{pane_title}",
  command: "#{pane_current_command}",
  path: "#{pane_current_path}",
};

export default function Command() {
  const panes = useLoad(() => rows(["list-panes", "-a"], fields));
  return (
    <List isLoading={panes === undefined} searchBarPlaceholder="Find a pane">
      {panes?.map((pane) => (
        <List.Item
          key={pane.id}
          title={`${pane.session}:${pane.window}.${pane.pane}`}
          subtitle={pane.title}
          keywords={[pane.session, pane.windowName, pane.command, pane.path]}
          accessories={[{ tag: pane.windowName }, { text: pane.command }, { text: pane.path }]}
          actions={
            <ActionPanel>
              <Action
                title="Switch to Pane"
                icon={Icon.ArrowRight}
                onAction={() =>
                  tmux([
                    "switch-client",
                    "-t",
                    pane.id,
                    ";",
                    "select-window",
                    "-t",
                    pane.id,
                    ";",
                    "select-pane",
                    "-t",
                    pane.id,
                  ])
                }
              />
              <Action
                title="Zoom / Unzoom Pane"
                icon={Icon.Maximize}
                onAction={() => tmux(["resize-pane", "-Z", "-t", pane.id])}
              />
              <Action
                title="Kill Pane"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (await confirmDestructive("kill-pane"))
                    await tmux(["kill-pane", "-t", pane.id]);
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
