import { environment, getPreferenceValues, List } from "@raycast/api";

export default function Command(props: unknown) {
  return (
    <List navigationTitle="Engine fixture">
      <List.Item
        title={JSON.stringify({
          props,
          preferences: getPreferenceValues(),
          assetsPath: environment.assetsPath,
        })}
      />
    </List>
  );
}
