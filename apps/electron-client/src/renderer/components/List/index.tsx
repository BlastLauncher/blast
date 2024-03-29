import type { Keyboard } from "@raycast/api";
import { Command } from "cmdk";
import React from "react";
import { Client } from "rpc-websockets";

import { ObjectFromList } from "../../lib/typeUtils";
import { useRemoteBlastTree } from "../../store";
import { BlastComponent } from "../../types";
import Icons from "../Icon";
import { useNavigationContext } from "../Navigation/context";

import { EmptyView } from "./EmptyView";
import { ListFooter } from "./ListFooter";

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

const Action = ({ action, ws, close }: { action: BlastComponent; ws: Client; close: () => void }) => {
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
        close();
      }}
      icon={Icon && <Icon />}
    >
      {title}
    </SubItem>
  );
};

export const ActionContainer = ({
  actions,
  ws,
  close,
}: {
  actions: BlastComponent[];
  ws: Client;
  close: () => void;
}) => {
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
                      return <Action action={child} ws={ws} key={child.props.actionEventName} close={close} />;
                    } else {
                      return null;
                    }
                  })
                  .filter(Boolean)}
              </Command.Group>
            );
          } else if (elementType === "Action") {
            return <Action action={elem} ws={ws} key={elem.props.actionEventName} close={close} />;
          } else {
            console.warn("Unknown action type", elementType);
            return null;
          }
        })
        .filter(Boolean)}
    </>
  );
};

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
      <div className="flex gap-2 items-center">
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

// ?NOTE: cmdk turn value into lowercase internally
function getListItemValue(itemIndex: number) {
  return `listitem-${itemIndex}`;
}

export function getListIndexFromValue(value: string) {
  return parseInt(value.replace("listitem-", ""), 10);
}

export const List = ({ children, props }: { children: BlastComponent[]; props: ListProps }): JSX.Element => {
  const listItems = children.filter((child) => child.elementType === "ListItem");
  const emptyView = children.find((child) => child.elementType === "EmptyView");
  const { softPop, pop } = useNavigationContext();

  const emptyViewActionPanel = emptyView
    ? emptyView.children.find((child) => child.elementType === "ActionPanel")
    : null;

  const listRef = React.useRef(null);
  const [value, setValue] = React.useState(getListItemValue(0));
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className="h-full raycast drag-area">
      <Command
        value={value}
        onValueChange={(v) => setValue(v)}
        onKeyDown={(e) => {
          if (!inputRef.current) {
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            if (inputRef.current.value) {
              inputRef.current.value = "";
            } else {
              pop();
            }
          } else if (e.key === "Backspace" && !inputRef.current.value) {
            e.preventDefault();
            softPop();
          }
        }}
      >
        <div className="absolute top-0 left-0 w-full h-2 drag-area" />

        <div cmdk-raycast-top-shine="" />
        <Command.Input
          autoFocus
          ref={inputRef}
          style={{ paddingTop: 16 }}
          placeholder={props.searchBarPlaceholder || "Search..."}
        />
        <hr cmdk-raycast-loader="" />

        <Command.List ref={listRef}>
          <Command.Empty className="flex flex-col gap-2 items-center h-full" style={{ height: "auto" }}>
            {" "}
            {emptyView && (
              <EmptyView
                title={emptyView.props?.title}
                icon={emptyView.props.icon}
                description={emptyView.props.description}
              />
            )}
          </Command.Empty>

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

        <ListFooter listRef={listRef} inputRef={inputRef} listItems={listItems} actionPanel={emptyViewActionPanel} />
      </Command>
    </div>
  );
};
