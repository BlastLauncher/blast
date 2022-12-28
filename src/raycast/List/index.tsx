import { List as RList } from "raycast-original";

import React, { useMemo } from "react";

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

const groupChildren = (children: React.ReactNode) => {
  let emptyView;
  const nonEmptyViewChildren: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === EmptyView) {
      emptyView = child;
    } else {
      nonEmptyViewChildren.push(child);
    }
  });

  return { emptyView, nonEmptyViewChildren };
};

export const List = (props: RList.Props) => {
  const { children, ...rest } = props;

  const hasOnlyOneChildren = React.Children.count(children) === 1;

  const { emptyView, nonEmptyViewChildren } = useMemo(() => groupChildren(children), [children]);

  return (
    <ElementTypes.List serializesKeys={serializesKeys} {...rest}>
      {emptyView && hasOnlyOneChildren ? children : nonEmptyViewChildren}
    </ElementTypes.List>
  );
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;
List.Item = Item;
