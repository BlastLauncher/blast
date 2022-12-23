import React from "react";
import { ActionPanel as RaycastAP } from "raycast-original";

import * as ElementTypes from "../../../elements/types";

export const ActionPanel = (props: RaycastAP.Props) => {
  return <ElementTypes.ActionPanel {...props} />;
};
