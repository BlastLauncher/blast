import { ActionPanel } from "raycast-original";

import { ComponentTypes } from "../types";

type ActionPanelSectionPropKeys = (keyof ActionPanel.Section.Props)[];
const serializesKeys: ActionPanelSectionPropKeys = ["title"];

export const Section = (props: ActionPanel.Section.Props) => {
  return <ComponentTypes.ActionPanelSection serializesKeys={serializesKeys} {...props} />;
};
