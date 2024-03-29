import { ElementTypes } from "@blastlauncher/renderer/src";
import type { ActionPanel as RActionPanel } from "raycast-original";
import { FunctionComponent } from "react";

import { Section } from "./Section";

type ActionPanelPropKeys = (keyof RActionPanel.Props)[];
const serializedKeys: ActionPanelPropKeys = ["title"];

export const ActionPanel: FunctionComponent<RActionPanel.Props> = (props) => {
  return <ElementTypes.ActionPanel serializedKeys={serializedKeys} {...props} />;
};

(ActionPanel as any).Section = Section;
