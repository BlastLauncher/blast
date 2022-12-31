import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import React from "react";

import { BlastComponent } from "../../types";

import { Item } from "./Item";

export type ListProps = {
  children: React.ReactNode;
};

export const List = (props: ListProps) => {
  return <div>{props.children}</div>;
};

List.Item = Item;

function SubCommand({
  inputRef,
  listRef,
  selectedValue,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  listRef: React.RefObject<HTMLElement>;
  selectedValue: string;
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function listener(e: KeyboardEvent) {
      if (e.key === "k" && e.metaKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }

    document.addEventListener("keydown", listener);

    return () => {
      document.removeEventListener("keydown", listener);
    };
  }, []);

  React.useEffect(() => {
    const el = listRef.current;

    if (!el) return;

    if (open) {
      el.style.overflow = "hidden";
    } else {
      el.style.overflow = "";
    }
  }, [open, listRef]);

  return (
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
            <Command.Group heading={selectedValue}>
              <SubItem shortcut="↵">Open Application</SubItem>
              <SubItem shortcut="⌘ ↵">Show in Finder</SubItem>
              <SubItem shortcut="⌘ I">Show Info in Finder</SubItem>
              <SubItem shortcut="⌘ ⇧ F">Add to Favorites</SubItem>
            </Command.Group>
          </Command.List>
          <Command.Input placeholder="Search for actions..." />
        </Command>
      </Popover.Content>
    </Popover.Root>
  );
}

function RaycastDarkIcon() {
  return (
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M301.144 634.799V722.856L90 511.712L134.244 467.804L301.144 634.799ZM389.201 722.856H301.144L512.288 934L556.34 889.996L389.201 722.856ZM889.996 555.956L934 511.904L512.096 90L468.092 134.052L634.799 300.952H534.026L417.657 184.679L373.605 228.683L446.065 301.144H395.631V628.561H723.048V577.934L795.509 650.395L839.561 606.391L723.048 489.878V389.105L889.996 555.956ZM323.17 278.926L279.166 322.978L326.385 370.198L370.39 326.145L323.17 278.926ZM697.855 653.61L653.994 697.615L701.214 744.834L745.218 700.782L697.855 653.61ZM228.731 373.413L184.679 417.465L301.144 533.93V445.826L228.731 373.413ZM578.174 722.856H490.07L606.535 839.321L650.587 795.269L578.174 722.856Z"
        fill="#FF6363"
      />
    </svg>
  );
}

function SubItem({ children, shortcut }: { children: React.ReactNode; shortcut: string }) {
  return (
    <Command.Item>
      {children}
      <div cmdk-raycast-submenu-shortcuts="">
        {shortcut.split(" ").map((key) => {
          return <kbd key={key}>{key}</kbd>;
        })}
      </div>
    </Command.Item>
  );
}

export const ListBlastComponent = ({ blastProps }: { blastProps: BlastComponent }): JSX.Element => {
  const listRef = React.useRef(null);
  const [value, setValue] = React.useState("0");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const listItems = blastProps.children.filter((child) => child.elementType === "ListItem");

  return (
    <div className="h-full raycast">
      <Command value={value} onValueChange={(v) => setValue(v)}>
        <div cmdk-raycast-top-shine="" />
        <Command.Input ref={inputRef} />
        <hr cmdk-raycast-loader="" />

        <Command.List ref={listRef}>
          <Command.Empty>No results found.</Command.Empty>

          {listItems.map((listItem, index) => {
            const {
              children,
              props: { title },
            } = listItem;

            return (
              <Command.Item value={`${index}`} key={index}>
                {title}
              </Command.Item>
            );
          })}
        </Command.List>

        <div cmdk-raycast-footer="">
          <RaycastDarkIcon />

          <button cmdk-raycast-open-trigger="">
            Open Application
            <kbd>↵</kbd>
          </button>

          <hr />

          <SubCommand listRef={listRef} selectedValue={value} inputRef={inputRef} />
        </div>
      </Command>
    </div>
  );
};
