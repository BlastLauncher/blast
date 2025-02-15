import type { Image, Keyboard, List as List_1 } from "@raycast/api";
import { Command } from "cmdk";
import React, { type ComponentProps } from "react";
import type { Client } from "rpc-websockets";
import * as Popover from "@radix-ui/react-popover";

import type { ObjectFromList } from "../../lib/typeUtils";
import { useBlastUIStore, useRemoteBlastTree } from "../../store";
import type { BlastComponent } from "../../types";
import Icons from "../Icon";
import { useNavigationContext } from "../Navigation/context";

import { EmptyView } from "./EmptyView";
import { ListFooter } from "./ListFooter";
import { useShallow } from "zustand/react/shallow";

const IconComp = ({ icon }: { icon: List_1.Item.Props["icon"] }) => {
  if (typeof icon === "string") {
    const Icon = Icons[icon as keyof typeof Icons] as () => JSX.Element;

    if (!Icon) {
      console.warn(`Icon ${JSON.stringify(icon)} not found`);
      return null;
    }

    return <Icon />;
  }

  if ((icon as Image)?.source) {
    const source = (icon as Image)?.source;
    if (typeof source === "string" && source.startsWith("data:image/svg+xml,")) {
      // Split the source into prefix and SVG markup.
      const [prefix, svg] = source.split(/,(.+)/); // split into two parts; the regex keeps the rest intact
      // Encode the SVG markup.
      const encodedSvg = encodeURIComponent(svg);
      // Reassemble the data URL.
      const encodedSource = `${prefix},${encodedSvg}`;

      return (
        <div className="w-5 h-5 text-center align-middle">
          <img src={encodedSource} alt="" />
        </div>
      );
    }
  }

  return null;
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

  return (
    <SubItem
      shortcut={shortcut ? renderShortcutToString(shortcut) : keyToSymbol.enter}
      key={actionEventName}
      onSelect={() => {
        ws.call(actionEventName);
        close();
      }}
      icon={<IconComp icon={icon} />}
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
  return Number.parseInt(value.replace("listitem-", ""), 10);
}

function ListDropdown(props: {
  tooltip: string;
  isLoading: boolean;
  throttle: boolean;
  value: string;
  placeholder: string;
  searchTextValue: string;
  onChangeEventName: string;
  onSearchTextChangeEventName: string;
  children: BlastComponent[];
}) {
  const { ws } = useRemoteBlastTree();

  const uiStore = useBlastUIStore(
    useShallow((state) => ({
      open: state.dropdownOpen,
      setOpen: state.setDropdownOpen,
    }))
  );
  const items = props?.children?.filter((child) => child.elementType === "DropdownItem");
  const onSelect = (v: string) => {
    ws.call(props.onChangeEventName, {
      value: v,
    });
    uiStore.setOpen(false);
  };

  return (
    <Popover.Root open={uiStore.open} onOpenChange={uiStore.setOpen} modal>
      <Popover.Trigger
        cmdk-raycast-subcommand-trigger=""
        onClick={() => uiStore.setOpen(true)}
        aria-expanded={uiStore.open}
      >
        {props.value}
      </Popover.Trigger>
      <Popover.Content side="bottom" align="end" className="raycast-submenu z-10" sideOffset={16} alignOffset={0}>
        <Command>
          <Command.Input placeholder={props.placeholder} />

          <Command.List className="max-h-[270px]">
            {items.map((item) => (
              <Command.Item key={item.props.value} onSelect={onSelect} value={item.props.value}>
                {item.props.title}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </Popover.Content>
    </Popover.Root>
  );
}

export const List = ({ children, props }: { children: BlastComponent[]; props: ListProps }): JSX.Element => {
  const listItems = children.filter((child) => child.elementType === "ListItem");
  const emptyView = children.find((child) => child.elementType === "EmptyView");
  const { softPop, pop } = useNavigationContext();

  const emptyViewActionPanel = emptyView
    ? emptyView.children.find((child) => child.elementType === "ActionPanel")
    : null;

  const dropdownElement = children.find((child) => child.elementType === "Dropdown");

  const listRef = React.useRef(null);
  const [value, setValue] = React.useState(getListItemValue(0));
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const isSomethingOpen = useBlastUIStore((state) => state.subcommandOpen || state.dropdownOpen);
  const { ws } = useRemoteBlastTree();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!inputRef.current) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (inputRef.current.value) {
        inputRef.current.value = "";
      } else if (!isSomethingOpen) {
        pop();
      }
    } else if (e.key === "Backspace" && !inputRef.current.value) {
      e.preventDefault();
      softPop();
    } else {
      // Check for configured action shortcut key
      const selectedIndex = getListIndexFromValue(value);
      const selectedListItem = listItems[selectedIndex];
      let actionData = selectedListItem
        ? selectedListItem.children.find((child) => child.elementType === "ActionPanel")
        : null;
      if (!actionData && emptyViewActionPanel) {
        actionData = emptyViewActionPanel;
      }
      let matchedAction = null;
      if (actionData && Array.isArray(actionData.children)) {
        matchedAction = actionData.children.find((action) => {
          if (action.props?.shortcut) {
            const shortcut = action.props.shortcut;
            const keyMatches = e.key.toLowerCase() === shortcut.key.toLowerCase();
            const requiredModifiers = shortcut.modifiers || [];
            const modifiersMatch = requiredModifiers.every((mod: string) => {
              if (mod === "ctrl") return e.ctrlKey;
              if (mod === "cmd") return e.metaKey;
              if (mod === "shift") return e.shiftKey;
              if (mod === "option") return e.altKey;
              return false;
            });
            return keyMatches && modifiersMatch;
          }
          return false;
        });
      }
      if (matchedAction?.props?.actionEventName) {
        e.preventDefault();
        ws.call(matchedAction.props.actionEventName);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const defaultAction =
          actionData && Array.isArray(actionData.children) && actionData.children.length > 0
            ? actionData.children[0]
            : null;
        if (defaultAction?.props?.actionEventName) {
          ws.call(defaultAction.props.actionEventName);
        }
      }
    }
  };

  return (
    <div className="h-full raycast drag-area">
      <Command value={value} onValueChange={(v) => setValue(v)} onKeyDown={handleKeyDown}>
        <div className="absolute top-0 left-0 w-full h-2 drag-area" />

        <div cmdk-raycast-top-shine="" />

        <div className="flex">
          <Command.Input
            autoFocus
            ref={inputRef}
            style={{ paddingTop: 16 }}
            placeholder={props.searchBarPlaceholder || "Search..."}
          />

          {dropdownElement && (
            <ListDropdown {...(dropdownElement.props as ComponentProps<typeof ListDropdown>)}>
              {dropdownElement.children}
            </ListDropdown>
          )}
        </div>

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

            return (
              <Command.Item key={value} value={value}>
                <IconComp icon={icon} />

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
