import { List } from "@raycast/api";

import { ComponentTypes } from "../../types";

type ListItemPropKeys = (keyof List.Item.Props)[];
const serializesKeys: ListItemPropKeys = [
  "accessories",
  "accessoryTitle",
  "id",
  "keywords",
  "quickLook",
  "subtitle",
  "title",
];

export const Item = (props: List.Item.Props) => {
  const { actions, ...rest } = props;

  return (
    <ComponentTypes.ListItem serializesKeys={serializesKeys} {...rest}>
      {actions}
    </ComponentTypes.ListItem>
  );
};
