import { Action, ActionPanel, Clipboard, List } from "@raycast/api";
import { useState } from "react";

console.log("host fixture loaded");
export default function Command() {
  const [title, setTitle] = useState("initial");
  return (
    <List navigationTitle={title}>
      <List.Item
        title="Item"
        actions={
          <ActionPanel>
            <Action title="Increment" onAction={() => setTitle("updated")} />
            <Action
              title="Copy"
              onAction={async () => {
                try {
                  await Clipboard.copy("hello");
                  setTitle("copied");
                } catch (error) {
                  setTitle(error.code);
                }
              }}
            />
            <Action title="Crash" onAction={() => process.exit(3)} />
          </ActionPanel>
        }
      />
    </List>
  );
}
