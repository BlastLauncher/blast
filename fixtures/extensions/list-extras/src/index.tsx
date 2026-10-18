import { Action, ActionPanel, List } from "@raycast/api";
import { useState } from "react";

const DRINKS = ["beer", "wine", "water"];
const ORIGIN: Record<string, string> = { beer: "Germany", wine: "France", water: "Norway" };

export default function Command() {
  const [drink, setDrink] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const visible = DRINKS.filter((d) => d.includes(searchText));
  return (
    <List
      navigationTitle={drink === null ? "list-extras" : `drink ${drink}`}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Drink" defaultValue="water" onChange={setDrink}>
          <List.Dropdown.Section title="Drinks">
            {DRINKS.map((d) => (
              <List.Dropdown.Item key={d} value={d} title={d} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {visible.map((d) => (
        <List.Item
          key={d}
          title={d}
          subtitle={ORIGIN[d]}
          accessories={[{ text: ORIGIN[d] }, { tag: new Date(0) }]}
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
    </List>
  );
}
