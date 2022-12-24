import { List } from "raycast-original";

import * as ElementTypes from "../../elements/types";

type EmptyViewPropKeys = (keyof List.EmptyView.Props)[];
const serializesKeys: EmptyViewPropKeys = ["title", "description", "icon"];

export const EmptyView = (props: List.EmptyView.Props) => {
  const { actions, ...rest } = props;

  return (
    <>
      <ElementTypes.EmptyView serializesKeys={serializesKeys} {...rest} />
      {actions}
    </>
  );
};
