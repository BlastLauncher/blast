import { Action, ActionPanel, List } from "@raycast/api";
import { useState } from "react";

const FRUITS = ["apple", "banana", "cherry"];

export default function Command() {
  const [pinned, setPinned] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const visible = FRUITS.filter((fruit) => fruit.includes(searchText));
  const parts: string[] = [];
  if (pinned !== null) parts.push(`pinned ${pinned}`);
  if (copied !== null) parts.push(`copied ${copied}`);
  return (
    <List
      navigationTitle={parts.length === 0 ? "hello-list" : parts.join(" ")}
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {visible.map((fruit) => (
        <List.Item
          key={fruit}
          title={fruit}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                content={fruit}
                title={`Copy ${fruit}`}
                onCopy={() => setCopied(fruit)}
              />
              <Action title={`Pin ${fruit}`} onAction={() => setPinned(fruit)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
