import { useCallback } from "react";

import { useRemoteBlastTree } from "../store";
import type { BlastComponent } from "../types";

import { Form, type FormProps } from "./Form";
import { List, type ListProps } from "./List";
import { NavigationContext } from "./Navigation/context";

export const TreeComponent = ({ blastProps }: { blastProps: BlastComponent }) => {
  const { ws } = useRemoteBlastTree();

  const NavigationRoot = findDeepComponent(blastProps, "NavigationRoot");

  if (!NavigationRoot) {
    return null;
  }

  const {
    children,
    props: { stacksLength },
  } = NavigationRoot;

  if (children.length === 0) {
    return null;
  }

  // TODO: handle multiple children, but for now we only care about the first one
  const [firstChild] = children;

  const { elementType, props } = firstChild;

  const canPop = stacksLength > 0;

  const pop = useCallback(() => {
    if (canPop) {
      ws.call("blast-global:pop");
    } else {
      window.electron.closeWindow();
    }
  }, [canPop, ws]);

  const softPop = useCallback(() => {
    if (canPop) {
      ws.call("blast-global:pop");
    }
  }, [canPop, ws]);

  return (
    <NavigationContext.Provider
      value={{
        pop,
        canPop,
        softPop
      }}
    >
      {elementType === "List" ? <List children={firstChild.children} props={props as ListProps} /> : null}
      {elementType === "Form" ? <Form children={firstChild.children} props={props as FormProps} /> : null}
    </NavigationContext.Provider>
  );
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
