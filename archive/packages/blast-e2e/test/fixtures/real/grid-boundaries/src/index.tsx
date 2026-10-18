import { Action, ActionPanel, Grid, Icon } from "@raycast/api";

export default function Command() {
  return (
    <Grid
      navigationTitle="Grid"
      columns={4}
      fit={Grid.Fit.Fill}
      inset={Grid.Inset.Small}
      searchBarPlaceholder="Filter items"
      searchBarAccessory={
        <Grid.Dropdown tooltip="Choose a group" defaultValue="all">
          <Grid.Dropdown.Section title="Groups">
            <Grid.Dropdown.Item value="all" title="All" />
            <Grid.Dropdown.Item value="featured" title="Featured" icon={Icon.Star} />
          </Grid.Dropdown.Section>
        </Grid.Dropdown>
      }
    >
      <Grid.Section title="Measured">
        <Grid.Item
          id="first"
          content={Icon.Circle}
          title="First"
          subtitle="Grid item"
          accessory={{ icon: Icon.Star, tooltip: "Favorite" }}
          actions={
            <ActionPanel>
              <Action title="Select" />
            </ActionPanel>
          }
        />
      </Grid.Section>
      <Grid.EmptyView title="No items" description="Try another search." />
    </Grid>
  );
}
