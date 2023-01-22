import { useCommandState } from "cmdk";
import React, { useMemo } from "react";

import { useRemoteBlastTree } from "../../store";
import { BlastComponent } from "../../types";

import { useDefaultAction } from "./hooks";
import { RaycastDarkIcon } from "./RaycastDarkIcon";
import { SubCommand } from "./SubCommand";

import { getListIndexFromValue } from ".";

export const ListFooter = ({
  inputRef,
  listItems,
  listRef,
}: {
  listRef: React.RefObject<HTMLElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  listItems: BlastComponent[];
}) => {
  const value = useCommandState((state) => state.value);
  const { ws } = useRemoteBlastTree();

  const currentListItem = useMemo(() => {
    if (!value) {
      return null;
    }

    const index = getListIndexFromValue(value);

    return listItems[index];
  }, [value, listItems]);

  const actionData = useMemo(() => {
    if (!currentListItem) {
      return null;
    }

    const { children } = currentListItem;

    const actionPanel = children.find((child) => child.elementType === "ActionPanel");

    return actionPanel;
  }, [currentListItem]);

  const action = useDefaultAction(actionData);

  return (
    <div cmdk-raycast-footer="">
      <RaycastDarkIcon />

      {action && (
        <button
          cmdk-raycast-open-trigger=""
          onClick={() => {
            ws.call(action.props.actionEventName);
          }}
        >
          {action.props.title}
          <kbd>↵</kbd>
        </button>
      )}

      <hr />

      <SubCommand listRef={listRef} inputRef={inputRef} actionData={actionData} />
    </div>
  );
};
