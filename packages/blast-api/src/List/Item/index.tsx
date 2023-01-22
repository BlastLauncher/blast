import { List } from "@raycast/api";
import { ElementTypes } from "blast-renderer";

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
    <ElementTypes.ListItem serializedKeys={serializedKeys} {...rest}>
      {actions}
    </ElementTypes.ListItem>
  );
};
