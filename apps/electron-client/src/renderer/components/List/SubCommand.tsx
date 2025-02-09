import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import React from "react";
import { useShallow } from 'zustand/react/shallow'

import { useBlastUIStore, useRemoteBlastTree } from "../../store";
import type { BlastComponent } from "../../types";

import { ActionContainer } from ".";

export function SubCommand({
  inputRef,
  listRef,
  actionData,
}: {
  inputRef?: React.RefObject<HTMLInputElement>;
  listRef?: React.RefObject<HTMLElement>;
  actionData: BlastComponent;
}) {
  const uiStore = useBlastUIStore(useShallow((state) => ({
    open: state.subcommandOpen,
    setOpen: state.setSubcommandOpen,
  })));

  React.useEffect(() => {
    function listener(e: KeyboardEvent) {
      if (e.key === "k" && e.metaKey) {
        e.preventDefault();
        uiStore.setOpen(true);
      }

      if (e.key === "Escape") {
        e.stopPropagation();
        uiStore.setOpen(false);
      }
    }

    document.addEventListener("keydown", listener);

    return () => {
      document.removeEventListener("keydown", listener);
    };
  }, [uiStore]);

  React.useEffect(() => {
    const el = listRef?.current;

    if (!el) return;

    if (uiStore.open) {
      el.style.overflow = "hidden";
    } else {
      el.style.overflow = "";
    }
  }, [uiStore.open, listRef]);

  const { ws } = useRemoteBlastTree();

  return (
    actionData && (
      <Popover.Root open={uiStore.open} onOpenChange={uiStore.setOpen} modal>
        <Popover.Trigger onClick={() => uiStore.setOpen(true)}>
          Actions
          <kbd>⌘</kbd>
          <kbd>K</kbd>
        </Popover.Trigger>
        <Popover.Content
          side="top"
          align="end"
          className="raycast-submenu"
          sideOffset={16}
          alignOffset={0}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            inputRef?.current?.focus();
          }}
        >
          <Command>
            <Command.List>
              <ActionContainer actions={actionData.children} ws={ws} close={() => uiStore.setOpen(false)} />
            </Command.List>

            <Command.Input placeholder="Search for actions..." />
          </Command>
        </Popover.Content>
      </Popover.Root>
    )
  );
}
