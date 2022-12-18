import { EmptyView as EmptyViewElement } from "../../elements/types";
import React from "react";
import { createDebug } from "../../utils/debug";

const debug = createDebug("blast:components:EmptyView");

export const EmptyView = (props: any) => {
  debug(props);

  return <EmptyViewElement {...props} />;
};
