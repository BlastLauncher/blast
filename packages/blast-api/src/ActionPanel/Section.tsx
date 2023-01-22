import { ActionPanel } from "raycast-original";

import { ElementTypes } from "@blast/renderer";

type ActionPanelSectionPropKeys = (keyof ActionPanel.Section.Props)[];
const serializedKeys: ActionPanelSectionPropKeys = ["title"];

export const Section = (props: ActionPanel.Section.Props) => {
  return <ElementTypes.ActionPanelSection serializedKeys={serializedKeys} {...props} />;
};
