import { BlastComponent } from "../types";

import { List, ListProps } from "./List";
// import { Form } from './Form'

export const renderTreeComponent = (blastProps: BlastComponent) => {
  const NavigationRoot = findDeepComponent(blastProps, "NavigationRoot");

  if (!NavigationRoot) {
    return null;
  }

  const { children } = NavigationRoot;

  if (children.length === 0) {
    return null;
  }

  // TODO: handle multiple children, but for now we only care about the first one
  const [firstChild] = children;

  const { elementType, props } = firstChild;

  if (elementType === "List") {
    return <List children={firstChild.children} props={props as ListProps} />;
  } else {
    // TODO: handle other types
  }
};

export const findDeepComponent = (blastProps: BlastComponent, type: string): BlastComponent => {
  const { elementType, children } = blastProps;

  if (elementType === type) {
    return blastProps;
  }

  for (const child of children) {
    const result = findDeepComponent(child, type);

    if (result) {
      return result;
    }
  }

  return null;
};
