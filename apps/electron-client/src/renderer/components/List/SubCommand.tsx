import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import React from "react";

import { useRemoteBlastTree } from "../../store";
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
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function listener(e: KeyboardEvent) {
      if (e.key === "k" && e.metaKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }

      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("keydown", listener);

    return () => {
      document.removeEventListener("keydown", listener);
    };
  }, []);

  React.useEffect(() => {
    const el = listRef?.current;

    if (!el) return;

    if (open) {
      el.style.overflow = "hidden";
    } else {
      el.style.overflow = "";
    }
  }, [open, listRef]);

  const { ws } = useRemoteBlastTree();

  return (
    actionData && (
      <Popover.Root open={open} onOpenChange={setOpen} modal>
        <Popover.Trigger cmdk-raycast-subcommand-trigger="" onClick={() => setOpen(true)} aria-expanded={open}>
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
              <ActionContainer actions={actionData.children} ws={ws} close={() => setOpen(false)} />
            </Command.List>

            <Command.Input placeholder="Search for actions..." />
          </Command>
        </Popover.Content>
      </Popover.Root>
    )
  );
}
