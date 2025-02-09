import { ElementTypes } from "@blastlauncher/renderer/src";
import { ActionPanel } from "raycast-original";


type ActionPanelSectionPropKeys = (keyof ActionPanel.Section.Props)[];
const serializedKeys: ActionPanelSectionPropKeys = ["title"];

export const Section = (props: ActionPanel.Section.Props) => {
  return <ElementTypes.ActionPanelSection serializedKeys={serializedKeys} {...props} />;
};
