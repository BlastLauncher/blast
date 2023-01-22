import { ActionPanel as RActionPanel } from "raycast-original";

import * as ElementTypes from "../../renderer/elements/types";

import { Section } from "./Section";

type ActionPanelPropKeys = (keyof RActionPanel.Props)[];
const serializedKeys: ActionPanelPropKeys = ["title"];

export const ActionPanel = (props: RActionPanel.Props) => {
  return <ElementTypes.ActionPanel serializedKeys={serializedKeys} {...props} />;
};

ActionPanel.Section = Section;
