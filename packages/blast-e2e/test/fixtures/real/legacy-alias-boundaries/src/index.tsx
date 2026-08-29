import {
  ActionPanel,
  ActionPanelItem,
  AlertActionStyle,
  Icon,
  List,
  ListSection,
  OpenWithAction,
} from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [status, setStatus] = useState("ready");

  return (
    <List navigationTitle={`Aliases:${status}`}>
      <ListSection id="files" title="Files" subtitle="Legacy list section">
        <List.Item
          title="Example file"
          actions={
            <ActionPanel>
              <ActionPanelItem
                title="Use destructive style"
                icon={Icon.QuestionMark}
                onAction={() => setStatus(AlertActionStyle.Destructive)}
              />
              <OpenWithAction path="/tmp/example.txt" />
            </ActionPanel>
          }
        />
      </ListSection>
    </List>
  );
}
