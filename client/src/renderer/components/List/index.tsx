import * as Popover from "@radix-ui/react-popover";
import type { Keyboard } from "@raycast/api";
import { Command, useCommandState } from "cmdk";
import React, { useMemo } from "react";
import { Client } from "rpc-websockets";

import { useRemoteBlastTree } from "../../store";
import { BlastComponent } from "../../types";
import Icons from "../Icon";

type ObjectFromList<T extends ReadonlyArray<string>, V = string> = {
  [K in T extends ReadonlyArray<infer U> ? U : never]: V;
};

const getIconComponent = (icon: string) => {
  const Icon = Icons[icon as keyof typeof Icons] as () => JSX.Element;

  if (!Icon) {
    console.warn(`Icon ${icon} not found`);
    return null;
  }

  return Icon;
};

const serializedKeys = [
  // navigation props
  "navigationTitle",
  "isLoading",

  // search bar props
  "filtering",
  "isLoading",
  "throttle",

  // list props
  "searchText",
  "enableFiltering",
  "searchBarPlaceholder",
  "selectedItemId",
  "isShowingDetail",
] as const;

export type ListProps = ObjectFromList<typeof serializedKeys>;

const keyToSymbol = {
  ctrl: "⌃",
  cmd: "⌘",
  shift: "⇧",
  option: "⌥",
  enter: "↵",
  esc: "⎋",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  space: "␣",
  backspace: "⌫",
  delete: "⌦",
};

const renderShortcutToString = (shortcut: Keyboard.Shortcut) => {
  const modifiers = shortcut.modifiers.map((modifier) => keyToSymbol[modifier as keyof typeof keyToSymbol]).join(" ");

  return `${modifiers} ${shortcut.key.toUpperCase()}`;
};

const Action = ({ action, ws }: { action: BlastComponent; ws: Client }) => {
  const {
    props: { shortcut, actionEventName, title, icon },
  } = action;

  const Icon = getIconComponent(icon);

  return (
    <SubItem
      shortcut={shortcut ? renderShortcutToString(shortcut) : keyToSymbol.enter}
      key={actionEventName}
      onSelect={() => {
        ws.call(actionEventName);
      }}
      icon={Icon && <Icon />}
    >
      {title}
    </SubItem>
  );
};

const ActionContainer = ({ actions, ws }: { actions: BlastComponent[]; ws: Client }) => {
  return (
    <>
      {actions
        .map((elem, index) => {
          const { elementType, props, children } = elem;

          if (elementType === "ActionPanelSection") {
            return (
              <Command.Group heading={props.title} key={`ActionGroup-${index}`}>
                {children
                  .map((child) => {
                    if (child.elementType === "Action") {
                      return <Action action={child} ws={ws} key={child.props.actionEventName} />;
                    } else {
                      return null;
                    }
                  })
                  .filter(Boolean)}
              </Command.Group>
            );
          } else if (elementType === "Action") {
            return <Action action={elem} ws={ws} key={elem.props.actionEventName} />;
          } else {
            console.warn("Unknown action type", elementType);
            return null;
          }
        })
        .filter(Boolean)}
    </>
  );
};

function SubCommand({
  inputRef,
  listRef,
  actionData,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  listRef: React.RefObject<HTMLElement>;
  actionData: BlastComponent;
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
              <ActionContainer actions={actionData.children} ws={ws} />
            </Command.List>

            <Command.Input placeholder="Search for actions..." />
          </Command>
        </Popover.Content>
      </Popover.Root>
    )
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

function SubItem({
  children,
  shortcut,
  onSelect,
  icon,
}: {
  children: React.ReactNode;
  shortcut: string;
  onSelect: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Command.Item onSelect={onSelect}>
      <div className="flex items-center gap-2">
        {icon}
        {children}
      </div>

      <div cmdk-raycast-submenu-shortcuts="">
        {shortcut.split(" ").map((key) => {
          return <kbd key={key}>{key}</kbd>;
        })}
      </div>
    </Command.Item>
  );
}

const ListFooter = ({
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

  const action = useMemo(() => {
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

// ?NOTE: cmdk turn value into lowercase internally
function getListItemValue(itemIndex: number) {
  return `listitem-${itemIndex}`;
}

function getListIndexFromValue(value: string) {
  return parseInt(value.replace("listitem-", ""), 10);
}

export const List = ({ children, props }: { children: BlastComponent[]; props: ListProps }): JSX.Element => {
  const listItems = children.filter((child) => child.elementType === "ListItem");

  const listRef = React.useRef(null);
  const [value, setValue] = React.useState(getListItemValue(0));
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className="h-full raycast drag-area">
      <Command value={value} onValueChange={(v) => setValue(v)}>
        <div className="absolute top-0 left-0 w-full h-2 drag-area" />

        <div cmdk-raycast-top-shine="" />
        <Command.Input ref={inputRef} style={{ paddingTop: 16 }} />
        <hr cmdk-raycast-loader="" />

        <Command.List ref={listRef}>
          <Command.Empty>No results found.</Command.Empty>

          {listItems.map((listItem, index) => {
            const {
              props: { title, icon },
            } = listItem;

            const value = getListItemValue(index);
            const Icon = getIconComponent(icon);

            return (
              <Command.Item key={value} value={value}>
                {icon && <Icon />}

                {title}
              </Command.Item>
            );
          })}
        </Command.List>

        <ListFooter listRef={listRef} inputRef={inputRef} listItems={listItems} />
      </Command>
    </div>
  );
};
