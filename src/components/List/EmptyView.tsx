import React from "react";
import { List } from "raycast-original";

import * as ElementTypes from "../../elements/types";

export const EmptyView = (props: List.EmptyView.Props) => {
  const { actions, ...rest } = props;

  return (
    <ElementTypes.EmptyView serializesKeys={["title", "description"]} {...rest}>
      {actions}
    </ElementTypes.EmptyView>
  );
};
