import { ActionPanel as RActionPanel } from "raycast-original";

import * as ElementTypes from "../../elements/types";

import { Section } from "./Section";

type ActionPanelPropKeys = (keyof RActionPanel.Props)[];
const serializesKeys: ActionPanelPropKeys = ["title"];

export const ActionPanel = (props: RActionPanel.Props) => {
  return <ElementTypes.ActionPanel serializesKeys={serializesKeys} {...props} />;
};

ActionPanel.Section = Section;
