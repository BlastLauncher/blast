import { BlastComponent } from "../types";

import * as CommandComponents from "./Command";
import * as ListComponents from "./List";

const components = {
  ...ListComponents,
  ...CommandComponents,
};

export const renderTreeComponent = (blastProps: BlastComponent) => {
  const { elementType, props, children } = blastProps;

  const Component = components[elementType as keyof typeof components];

  if (!Component) {
    return null;
  }

  return <Component {...props}>{children.map(renderTreeComponent)}</Component>;
};
