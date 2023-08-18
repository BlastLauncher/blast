import { List as RList } from "raycast-original";

import { ElementTypes } from "@blastlauncher/renderer/src";
import { FunctionComponent } from "react";

import { Dropdown } from "./Dropdown";
import { EmptyView } from "./EmptyView";
import { Item } from "./Item";

type ListPropKeys = (keyof RList.Props)[];

const serializedKeys: ListPropKeys = [
  // navigation props
  "navigationTitle",
  "isLoading",

  // search bar props
  "filtering",
  "isLoading",
  "throttle",

  // list props
  "searchText",
  "enableFiltering",
  "searchBarPlaceholder",
  "selectedItemId",
  "isShowingDetail",
];

export const List: FunctionComponent<RList.Props> = (props: RList.Props) => {
  const { children, actions, ...rest } = props;

  return (
    <ElementTypes.List serializedKeys={serializedKeys} {...rest}>
      {children}
      {actions}
    </ElementTypes.List>
  );
};

(List as any).Dropdown = Dropdown;
(List as any).EmptyView = EmptyView;
(List as any).Item = Item;
