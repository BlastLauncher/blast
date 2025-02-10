/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElementTypes } from "@blastlauncher/renderer/src";
import type { List as RList } from "raycast-original";
import type { FunctionComponent } from "react";

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
  const { children, actions, searchBarAccessory, ...rest } = props;

  return (
    <ElementTypes.List serializedKeys={serializedKeys} {...rest}>
      {searchBarAccessory}
      {children}
      {actions}
    </ElementTypes.List>
  );
};

(List as typeof RList).Dropdown = Dropdown;
(List as any).EmptyView = EmptyView;
(List as any).Item = Item;
