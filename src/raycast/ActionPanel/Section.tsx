import { ActionPanel } from "raycast-original";

import { ComponentTypes } from "../types";

type ActionPanelSectionPropKeys = (keyof ActionPanel.Section.Props)[];
const serializedKeys: ActionPanelSectionPropKeys = ["title"];

export const Section = (props: ActionPanel.Section.Props) => {
  return <ComponentTypes.ActionPanelSection serializedKeys={serializedKeys} {...props} />;
};
