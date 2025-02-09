import { useCommandState } from "cmdk";
import type React from "react";
import { useMemo } from "react";

import { useRemoteBlastTree } from "../../store";
import type { BlastComponent } from "../../types";

import { useDefaultAction } from "./hooks";
import { SubCommand } from "./SubCommand";

import { getListIndexFromValue } from ".";

export const ListFooter = ({
  inputRef,
  listItems,
  listRef,
  actionPanel,
}: {
  listRef: React.RefObject<HTMLElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  listItems: BlastComponent[];
  actionPanel?: BlastComponent;
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

  const activeActionData = useMemo(() => {
    if (!currentListItem) {
      return null;
    }

    const { children } = currentListItem;

    const actionPanel = children.find((child) => child.elementType === "ActionPanel");

    return actionPanel;
  }, [currentListItem]);

  const action = useDefaultAction(activeActionData || actionPanel);

  return (
    <div cmdk-raycast-footer="">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
          stroke="#FF6363"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 16V12" stroke="#FF6363" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 8H12.01" stroke="#FF6363" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

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

      <SubCommand listRef={listRef} inputRef={inputRef} actionData={activeActionData} />
    </div>
  );
};
