import { List } from "@raycast/api";

import { ComponentTypes } from "../../types";

type ListItemPropKeys = (keyof List.Item.Props)[];
const serializedKeys: ListItemPropKeys = [
  "accessories",
  "accessoryTitle",
  "id",
  "keywords",
  "quickLook",
  "subtitle",
  "title",
  "icon",
];

export const Item = (props: List.Item.Props) => {
  const { actions, ...rest } = props;

  return (
    <ComponentTypes.ListItem serializedKeys={serializedKeys} {...rest}>
      {actions}
    </ComponentTypes.ListItem>
  );
};
