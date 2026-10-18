import { useState } from "react";
import { Action, ActionPanel, Detail, List } from "@raycast/api";

export default function Command() {
  const [count, setCount] = useState(0);
  const [popped, setPopped] = useState(false);
  return (
    <List navigationTitle={`count ${count} popped ${popped}`}>
      <List.Item
        title="Navigation"
        actions={
          <ActionPanel>
            <Action title="Increment" onAction={() => setCount((value) => value + 1)} />
            <Action.Push
              title="Open details"
              target={<Detail markdown="pushed detail" />}
              onPop={() => setPopped(true)}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
