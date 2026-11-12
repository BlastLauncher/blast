import { Action, ActionPanel, Grid, showHUD } from "@raycast/api";

const SECTIONS = [
  {
    title: "Fruit",
    items: [
      ["🍎", "Apple"],
      ["🍌", "Banana"],
      ["🍒", "Cherry"],
      ["🥝", "Kiwi"],
    ],
  },
  {
    title: "Vegetables",
    items: [
      ["🥕", "Carrot"],
      ["🥦", "Broccoli"],
      ["🌽", "Corn"],
    ],
  },
];

export default function Command() {
  return (
    <Grid navigationTitle="Grid" columns={4} searchBarPlaceholder="Filter produce…">
      {SECTIONS.map((section) => (
        <Grid.Section key={section.title} title={section.title}>
          {section.items.map(([emoji, title]) => (
            <Grid.Item
              key={title}
              content={emoji ?? ""}
              title={title ?? ""}
              subtitle={section.title}
              actions={
                <ActionPanel>
                  <Action title="Pick" onAction={() => void showHUD(`Picked ${title}`)} />
                </ActionPanel>
              }
            />
          ))}
        </Grid.Section>
      ))}
    </Grid>
  );
}
