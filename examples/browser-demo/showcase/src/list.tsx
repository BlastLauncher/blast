import { Action, ActionPanel, Color, Detail, Icon, List } from "@raycast/api";

const PLANETS = [
  { name: "Mercury", kind: "Rocky", moons: 0, icon: Icon.Circle },
  { name: "Venus", kind: "Rocky", moons: 0, icon: Icon.Sun },
  { name: "Earth", kind: "Rocky", moons: 1, icon: Icon.Globe },
  { name: "Mars", kind: "Rocky", moons: 2, icon: Icon.Mountain },
  { name: "Jupiter", kind: "Giant", moons: 95, icon: Icon.Circle },
  { name: "Saturn", kind: "Giant", moons: 146, icon: Icon.Stars },
];

export default function Command() {
  return (
    <List navigationTitle="List" searchBarPlaceholder="Filter planets…">
      {["Rocky", "Giant"].map((kind) => (
        <List.Section key={kind} title={`${kind} planets`}>
          {PLANETS.filter((planet) => planet.kind === kind).map((planet) => (
            <List.Item
              key={planet.name}
              icon={{ source: planet.icon, tintColor: Color.Orange }}
              title={planet.name}
              subtitle={planet.kind === "Rocky" ? "Inner system" : "Outer system"}
              accessories={[
                { text: `${planet.moons} ${planet.moons === 1 ? "moon" : "moons"}` },
                { tag: planet.kind },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Show Planet"
                    target={
                      <Detail
                        navigationTitle={planet.name}
                        markdown={`# ${planet.name}\n\nA ${planet.kind.toLowerCase()} planet with **${planet.moons}** known moons.\n\nPress Esc to go back.`}
                      />
                    }
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
