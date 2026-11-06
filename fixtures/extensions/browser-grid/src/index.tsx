import { Action, ActionPanel, Grid } from "@raycast/api";
import { useState } from "react";

// Two rows of three cells, so selection can move in both dimensions.
const DRINKS = ["beer", "wine", "water", "cider", "tea", "milk"];

export default function Command() {
  const [drink, setDrink] = useState("none");
  return (
    <Grid
      navigationTitle={`drink ${drink}`}
      columns={3}
      searchBarAccessory={
        <Grid.Dropdown tooltip="Drink" defaultValue="beer" onChange={setDrink}>
          {DRINKS.map((d) => (
            <Grid.Dropdown.Item key={d} value={d} title={d} />
          ))}
        </Grid.Dropdown>
      }
    >
      <Grid.Section title="Drinks">
        {DRINKS.map((d) => (
          <Grid.Item
            key={d}
            content={{ value: `${d}.png` }}
            title={d}
            subtitle={d.toUpperCase()}
            actions={
              <ActionPanel>
                <Action title={`Pick ${d}`} onAction={() => setDrink(d)} />
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
    </Grid>
  );
}
