import { List as RList } from "raycast-original";

import * as ElementTypes from "../../elements/types";

import { Dropdown } from "./Dropdown";
import { EmptyView } from "./EmptyView";
import { Item } from "./Item";

type ListPropKeys = (keyof RList.Props)[];

const serializesKeys: ListPropKeys = [
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

export const List = (props: RList.Props) => {
  const { children, actions, ...rest } = props;

  return (
    <ElementTypes.List serializesKeys={serializesKeys} {...rest}>
      {children}
      {actions}
    </ElementTypes.List>
  );
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;
List.Item = Item;
