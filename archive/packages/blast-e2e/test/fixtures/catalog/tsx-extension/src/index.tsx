// Immutable fixture command: a Raycast-style TSX component with literal
// @raycast/api imports, resolved at bundle time.
import { Action, ActionPanel, Icon, List } from "@raycast/api";

export default function Command() {
  return (
    <List navigationTitle="Compat TSX">
      <List.Item
        title="Hello"
        subtitle="World"
        icon={Icon.Circle}
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy" content="from-tsx" />
          </ActionPanel>
        }
      />
    </List>
  );
}
