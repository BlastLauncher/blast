import React from "react";
import union from "lodash/union";

import { Dropdown } from "./Dropdown";
import { EmptyView } from "./EmptyView";
import { List as RaycastList } from "raycast-original";
import * as ElementTypes from "../../elements/types";

const navigationProps = ["navigationTitle", "isLoading"];
const searchBarProps = ["filtering", "isLoading", "throttle"];
const listProps = ["searchText", "enableFiltering", "searchBarPlaceholder", "selectedItemId", "isShowingDetail"];

export const List = (props: RaycastList.Props) => {
  return <ElementTypes.List serializesKeys={union(navigationProps, searchBarProps, listProps)} {...props} />;
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;

export * from "./ActionPanel";
export * from "./Action";
