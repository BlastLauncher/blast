import { ElementTypes } from "@blastlauncher/renderer";
import { createDebug } from "@blastlauncher/utils/src";
import type { List as RList } from "raycast-original";
import { Children, useCallback, useEffect, useId, useMemo, useState } from "react";

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

  // TODO: handle section
  const values = useMemo(() => {
    return Children.toArray(children).filter(child => (child as React.ReactElement).type === Item).map(child => {
      const elem = child as React.ReactElement
      return elem.props.value
    })
  }, [children])

  useEffect(() => {
    if (props.defaultValue && values.find(v => v === props.defaultValue)) {
      props.onChange?.(props.defaultValue)
    } else if (values.length > 0) {
      props.onChange?.(values[0])
    }
  }, [values, props.defaultValue, props.onChange])

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
