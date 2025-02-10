import { ElementTypes } from "@blastlauncher/renderer";
import { createDebug } from "@blastlauncher/utils/src";
import type { List as RList } from "raycast-original";

const debug = createDebug("blast:list:item");

type DropdownItemPropKeys = (keyof RList.Dropdown.Item.Props)[];
const serializedKeys: DropdownItemPropKeys = ["icon", "keywords", "title", "value"];

export const Item = (props: RList.Dropdown.Item.Props) => {
  return <ElementTypes.DropdownItem {...props} serializedKeys={serializedKeys} />;
};
