import React from "react";
import { Action as RaycastAction } from "raycast-original";

import * as ElementTypes from "../../../elements/types";

export const Action = (props: RaycastAction.Props) => {
  return <ElementTypes.Action serializesKeys={["title", "autoFocus", "shortcut", "style"]} {...props} />;
};

const Push = (props: RaycastAction.Push.Props) => {
  return <Action {...props} />;
};

Action.Push = Push;
