import { Action, ActionPanel, List, LocalStorage, open } from "@raycast/api";
import { useState } from "react";

// Drives the storage and open capabilities from actions so a script can decide
// when each request happens; the scene then shows the host's answer.
export default function Command() {
  const [lines, setLines] = useState<string[]>([]);
  const report = async (line: () => Promise<string>) => {
    try {
      setLines([...lines, await line()]);
    } catch (error) {
      setLines([...lines, `failed ${(error as Error).message}`]);
    }
  };
  return (
    <List navigationTitle={`storage ${lines.join(" ")}`}>
      <List.Item
        title="Storage"
        actions={
          <ActionPanel>
            <Action
              title="Increment"
              onAction={() =>
                report(async () => {
                  const count = ((await LocalStorage.getItem<number>("count")) ?? 0) + 1;
                  await LocalStorage.setItem("count", count);
                  return `count ${count}`;
                })
              }
            />
            <Action
              title="All"
              onAction={() =>
                report(async () => `all ${JSON.stringify(await LocalStorage.allItems())}`)
              }
            />
            <Action
              title="Remove"
              onAction={() =>
                report(async () => {
                  await LocalStorage.removeItem("count");
                  return "removed";
                })
              }
            />
            <Action
              title="Clear"
              onAction={() =>
                report(async () => {
                  await LocalStorage.clear();
                  return "cleared";
                })
              }
            />
            <Action
              title="Open URL"
              onAction={() =>
                report(async () => {
                  await open("https://example.com/docs");
                  return "opened url";
                })
              }
            />
            <Action
              title="Open File"
              onAction={() =>
                report(async () => {
                  await open("/tmp/report.txt", "TextEdit");
                  return "opened file";
                })
              }
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
