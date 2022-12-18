import React from "react";
import { Dropdown } from "./Dropdown";
import { EmptyView } from "./EmptyView";
import { List as ListElement } from "../../elements/types";

export const List = (props: any) => {
  return <ListElement {...props} />;
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;
