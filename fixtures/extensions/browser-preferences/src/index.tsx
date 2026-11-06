import {
  Action,
  ActionPanel,
  List,
  openExtensionPreferences,
  getPreferenceValues,
} from "@raycast/api";

export default function Command() {
  const values = getPreferenceValues<{ secret: string; flavor: string }>();
  return (
    <List navigationTitle="Browser preferences">
      <List.Item
        title={`Secret: ${values.secret}`}
        subtitle={`Flavor: ${values.flavor}`}
        actions={
          <ActionPanel>
            <Action title="Preferences" onAction={() => void openExtensionPreferences()} />
          </ActionPanel>
        }
      />
    </List>
  );
}
