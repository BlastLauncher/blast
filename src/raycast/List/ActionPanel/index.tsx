import { ActionPanel as RActionPanel } from "raycast-original";

import * as ElementTypes from "../../../elements/types";

type ActionPanelPropKeys = (keyof RActionPanel.Props)[];
const serializesKeys: ActionPanelPropKeys = ["title"];

export const ActionPanel = (props: RActionPanel.Props) => {
  return <ElementTypes.ActionPanel serializesKeys={serializesKeys} {...props} />;
};
