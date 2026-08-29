import {
  Action,
  ActionPanel,
  Image,
  List,
  LaunchType,
  closeMainWindow,
  openExtensionPreferences,
  popToRoot,
  type LaunchProps,
} from "@raycast/api";
import { useEffect } from "react";

export default function Command(props: LaunchProps) {
  useEffect(() => {
    void closeMainWindow({ clearRootSearch: true });
    void popToRoot({ clearSearchBar: true });
    void openExtensionPreferences();
  }, []);

  return (
    <List navigationTitle={`${props.launchType}:${LaunchType.UserInitiated}`}>
      <List.Item
        title={String(props.arguments.query ?? "empty")}
        icon={{ source: "launch.png", mask: Image.Mask.RoundedRectangle }}
        actions={
          <ActionPanel>
            <Action title="Run" />
          </ActionPanel>
        }
      />
    </List>
  );
}
