import { List } from "raycast-original";

import * as ElementTypes from "../../renderer/elements/types";

type EmptyViewPropKeys = (keyof List.EmptyView.Props)[];
const serializedKeys: EmptyViewPropKeys = ["title", "description", "icon"];

export const EmptyView = (props: List.EmptyView.Props) => {
  const { actions, ...rest } = props;

  return (
    <ElementTypes.EmptyView serializedKeys={serializedKeys} {...rest}>
      {actions}
    </ElementTypes.EmptyView>
  );
};
