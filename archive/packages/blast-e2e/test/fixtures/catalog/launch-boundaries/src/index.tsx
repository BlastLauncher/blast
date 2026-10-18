import {
  Action,
  ActionPanel,
  Image,
  List,
  LaunchType,
  closeMainWindow,
  launchCommand,
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
    void launchCommand({
      name: "details",
      type: LaunchType.Background,
      arguments: { query: "raycast" },
      context: { source: "fixture" },
      fallbackText: "open details",
    });
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
