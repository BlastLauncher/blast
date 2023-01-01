import { useMemo } from "react";

import { BlastComponent } from "../../types";

export const useDefaultAction = (actionData: BlastComponent) => {
  return useMemo(() => {
    if (!actionData) {
      return null;
    }

    const { children } = actionData;

    const firstAction = children.find((child) => child.elementType === "Action");

    const firstActionPanelSection = children.find(
      (child) => child.elementType === "ActionPanelSection" && child.children.length > 0
    );

    if (firstActionPanelSection) {
      const { children } = firstActionPanelSection;

      const firstAction = children.find((child) => child.elementType === "Action");

      return firstAction;
    } else {
      return firstAction;
    }
  }, [actionData]);
};
