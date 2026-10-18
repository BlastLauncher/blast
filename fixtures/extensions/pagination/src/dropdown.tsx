import { List } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [drink, setDrink] = useState("water");
  return (
    <List
      navigationTitle={`drink ${drink}`}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Drink"
          id="drink"
          defaultValue="water"
          storeValue
          onChange={setDrink}
        >
          <List.Dropdown.Item title="Water" value="water" />
          <List.Dropdown.Item title="Wine" value="wine" />
        </List.Dropdown>
      }
    />
  );
}
