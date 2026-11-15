import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { query, rows, target, tmux, useLoad } from "./tmux.ts";

const fields = {
  id: "#{window_id}",
  session: "#{session_name}",
  index: "#{window_index}",
  name: "#{window_name}",
  panes: "#{window_panes}",
};

async function load() {
  const [origin, windows] = await Promise.all([
    query(["display-message", "-p", "-t", target(), "#{pane_id}\t#{window_id}\t#{session_id}"]),
    rows(["list-windows", "-a"], fields),
  ]);
  const [pane = target(), window, session = ""] = origin.split("\t");
  // Joining a pane into its own window is not a move.
  return { pane, session, windows: windows.filter((candidate) => candidate.id !== window) };
}

export default function Command() {
  const loaded = useLoad(load);
  return (
    <List isLoading={loaded === undefined} searchBarPlaceholder="Move the pane to a window">
      {loaded && (
        <List.Item
          title="New Window"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action
                title="Move to New Window"
                // Without -t, tmux picks its most recent session, not the pane's.
                onAction={() => tmux(["break-pane", "-s", loaded.pane, "-t", `${loaded.session}:`])}
              />
            </ActionPanel>
          }
        />
      )}
      {loaded?.windows.map((window) => (
        <List.Item
          key={window.id}
          title={`${window.session}:${window.index}`}
          subtitle={window.name}
          keywords={[window.session, window.name]}
          accessories={[{ text: `${window.panes} panes` }]}
          actions={
            <ActionPanel>
              <Action
                title="Move to Window"
                onAction={() => tmux(["join-pane", "-s", loaded.pane, "-t", window.id])}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
