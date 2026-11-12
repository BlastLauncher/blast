import { Action, ActionPanel, Detail, List, showHUD } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [size, setSize] = useState("Medium");
  return (
    <List navigationTitle="Actions">
      <List.Item
        title={`Coffee size: ${size}`}
        subtitle="⌘K opens every action"
        actions={
          <ActionPanel title="Coffee">
            <Action.Push
              title="Push a View"
              target={
                <Detail markdown={`# Pushed\n\nA ${size.toLowerCase()} coffee. Esc goes back.`} />
              }
            />
            <ActionPanel.Submenu title="Choose Size">
              {["Small", "Medium", "Large"].map((value) => (
                <Action key={value} title={value} onAction={() => setSize(value)} />
              ))}
            </ActionPanel.Submenu>
            <Action.CopyToClipboard title="Copy Order" content={`${size} coffee`} />
            <Action.OpenInBrowser
              title="Open Blast on GitHub"
              url="https://github.com/blastlauncher/blast"
            />
            <Action
              title="Say Hello"
              shortcut={{ modifiers: ["cmd", "shift"], key: "h" }}
              onAction={() => void showHUD("Hello from a shortcut")}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
