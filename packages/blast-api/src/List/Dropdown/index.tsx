import { ElementTypes } from "@blastlauncher/renderer";
import { createDebug } from "@blastlauncher/utils/src";
import type { List as RList } from "raycast-original";
import { useCallback, useId, useMemo, useState } from "react";

import { useServerEvent } from "../../internal/hooks";

import { Item } from "./Item";

const debug = createDebug("blast:list:dropdown");

type DropdownPropKeys = (keyof RList.Dropdown.Props)[];

const serializedKeys: DropdownPropKeys = [
  "defaultValue",
  "filtering",
  "id",
  "isLoading",
  "placeholder",
  "storeValue",
  "throttle",
  "tooltip",
  "value",

  // event
];

export const Dropdown = (props: RList.Dropdown.Props) => {
  const { children, onChange, onSearchTextChange, ...rest } = props;

  const dropdownId = useId();
  const onChangeEventName = useMemo(() => `action${dropdownId}onChange`, [dropdownId]);
  const onSearchTextChangeEventName = useMemo(() => `action${dropdownId}onSearchTextChange`, [dropdownId]);

  const [internalValue, setInternalValue] = useState<string | undefined>(props.value);
  const [internalSearchTextValue, setInternalSearchTextValue] = useState<string>("");

  const onChangeHandler = useCallback(({ value }: { value: string }) => {
    debug("triggering on change event listener", value);
    setInternalValue(value);

    return null;
  }, []);

  const onSearchTextChangeHandler = useCallback((text: string) => {
    setInternalSearchTextValue(text);
  }, []);

  useServerEvent(onChangeEventName, onChangeHandler);
  useServerEvent(onSearchTextChangeEventName, onSearchTextChangeHandler);

  return (
    <ElementTypes.Dropdown
      serializedKeys={[...serializedKeys, "onChangeEventName", "onSearchTextChangeEventName"]}
      {...rest}
      onChangeEventName={onChangeEventName}
      onSearchTextChangeEventName={onSearchTextChangeEventName}
    >
      {children}
    </ElementTypes.Dropdown>
  );
};

(Dropdown as any).Item = Item;
