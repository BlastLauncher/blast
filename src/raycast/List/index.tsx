import { List as RList } from "raycast-original";

import * as ElementTypes from "../../elements/types";

import { Dropdown } from "./Dropdown";
import { EmptyView } from "./EmptyView";

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
  return <ElementTypes.List serializesKeys={serializesKeys} {...props} />;
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;

export * from "./ActionPanel";
export * from "./Action";
