import type { ActionPanel as RActionPanel } from "@raycast/api";
import { ElementTypes } from "blast-renderer";

import { Section } from "./Section";

type ActionPanelPropKeys = (keyof RActionPanel.Props)[];
const serializedKeys: ActionPanelPropKeys = ["title"];

export const ActionPanel = (props: RActionPanel.Props) => {
  return <ElementTypes.ActionPanel serializedKeys={serializedKeys} {...props} />;
};

ActionPanel.Section = Section;
