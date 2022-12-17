import React from "react";
import { Dropdown } from "./Dropdown";
import { EmptyView } from "./EmptyView";
import { createDebug } from "../../utils/debug";
import { ComponentType } from "../../elements/types";

const debug = createDebug("blast:components:List");

export const List = (props: any) => {
  debug(props);

  return React.createElement(ComponentType.List, props);
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;
