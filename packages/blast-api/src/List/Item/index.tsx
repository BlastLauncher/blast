import { ElementTypes } from "@blastlauncher/renderer/src";
import type { List } from "raycast-original";

import { Accessory } from './Accessory'

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

(Item as any).Accessory = Accessory
