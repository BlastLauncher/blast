import { Action, ActionPanel, Grid } from "@raycast/api";
import { useState } from "react";

const DRINKS = ["beer", "wine", "water"];
const ORIGIN: Record<string, string> = { beer: "Germany", wine: "France", water: "Norway" };

export default function Command() {
  const [drink, setDrink] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const visible = DRINKS.filter((d) => d.includes(searchText));
  return (
    <Grid
      navigationTitle={drink === null ? "grid" : `drink ${drink}`}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      columns={3}
      aspectRatio="1"
      fit={Grid.Fit.Contain}
      inset={Grid.Inset.Small}
      searchBarAccessory={
        <Grid.Dropdown tooltip="Drink" defaultValue="water" onChange={setDrink}>
          <Grid.Dropdown.Section title="Drinks">
            {DRINKS.map((d) => (
              <Grid.Dropdown.Item key={d} value={d} title={d} />
            ))}
          </Grid.Dropdown.Section>
        </Grid.Dropdown>
      }
    >
      {visible.length === 0 ? (
        <Grid.EmptyView title="Nothing" description="No drink matches" />
      ) : (
        <Grid.Section title="Drinks" subtitle="Still or sparkling">
          {visible.map((d) => (
            <Grid.Item
              key={d}
              content={{ value: `${d}.png`, tooltip: ORIGIN[d] }}
              title={d}
              subtitle={ORIGIN[d]}
              accessory={{ icon: "star.png" }}
              actions={
                <ActionPanel>
                  <Action
                    title={`Delete ${d}`}
                    style={Action.Style.Destructive}
                    onAction={() => setSearchText(`deleted ${d}`)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </Grid.Section>
      )}
    </Grid>
  );
}
