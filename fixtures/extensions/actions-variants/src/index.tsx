import { Action, ActionPanel, List } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [events, setEvents] = useState<string[]>([]);
  const record = (event: string) => setEvents((current) => [...current, event]);
  return (
    <List navigationTitle={events.length === 0 ? "actions-variants" : events.join(" | ")}>
      <List.Item
        title="Everything"
        actions={
          <ActionPanel>
            <ActionPanel.Submenu
              title="Labels"
              filtering
              throttle
              onOpen={() => record("opened Labels")}
              onSearchTextChange={(text) => record(`searched ${text}`)}
            >
              <ActionPanel.Section title="Colors">
                <Action title="Red" onAction={() => record("picked Red")} />
              </ActionPanel.Section>
              <Action title="Plain" onAction={() => record("picked Plain")} />
            </ActionPanel.Submenu>
            <Action.Open
              title="Open Target"
              target="/tmp/blast-demo"
              application="Finder"
              onOpen={(target) => record(`opened ${target}`)}
            />
            <Action.OpenWith
              path="/tmp/blast-demo"
              onOpen={(path) => record(`open-with ${path}`)}
            />
            <Action.ShowInFinder
              path="/tmp/blast-demo"
              onShow={(path) => record(`showed ${path}`)}
            />
            <Action.Trash
              paths="/tmp/blast-demo.txt"
              onTrash={(paths) => record(`trashed ${String(paths)}`)}
            />
            <Action.CreateSnippet snippet={{ text: "DE75512108001245126199", name: "IBAN" }} />
            <Action.CreateQuicklink
              quicklink={{ link: "https://duckduckgo.com/?q={Query}", name: "Duck" }}
            />
            <Action.ToggleQuickLook />
            <Action.PickDate
              title="Pick a date"
              onChange={(date) => record(`picked ${date?.toISOString() ?? "null"}`)}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
