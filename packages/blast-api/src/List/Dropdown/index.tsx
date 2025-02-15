/* eslint-disable react/prop-types */
import { ElementTypes } from "@blastlauncher/renderer";
import { createDebug } from "@blastlauncher/utils/src";
import type { List as RList } from "raycast-original";
import { Children, useCallback, useEffect, useId, useMemo, useState } from "react";

import { useServerEvent } from "../../internal/hooks";

import { Item } from "./Item";

const debug = createDebug("blast:list:dropdown");

type DropdownProps = RList.Dropdown.Props & {
  children?: React.ReactNode;
  onChange?: (value: string) => void;
  onSearchTextChange?: (text: string) => void;
  defaultValue?: string;
};

type DropdownPropKeys = (keyof RList.Dropdown.Props)[];

const serializedKeys: DropdownPropKeys = ["defaultValue", "isLoading", "placeholder", "throttle", "tooltip", "value"];

export const Dropdown: React.FC<DropdownProps> = (props) => {
  const { children, placeholder, value, filtering: _filtering, onSearchTextChange, onChange, defaultValue, ...rest } = props;

  console.log(value, 'value')
  console.log(props, 'props')

  const dropdownId = useId();
  const onChangeEventName = useMemo(() => `action${dropdownId}onChange`, [dropdownId]);
  const onSearchTextChangeEventName = useMemo(() => `action${dropdownId}onSearchTextChange`, [dropdownId]);

  const [internalValue, setInternalValue] = useState<string | undefined>(defaultValue || value);
  const [internalSearchTextValue, setInternalSearchTextValue] = useState<string>("");

  const onChangeHandler = useCallback(({ value }: { value: string }) => {
    debug("triggering on change event listener", value);
    setInternalValue(value);

    onChange?.(value)
  }, [onChange]);

  const onSearchTextChangeHandler = useCallback((text: string) => {
    setInternalSearchTextValue(text);
  }, []);

  useServerEvent(onChangeEventName, onChangeHandler);
  useServerEvent(onSearchTextChangeEventName, onSearchTextChangeHandler);

  // TODO: handle DropdownSection
  const values = useMemo(() => {
    return Children.toArray(children)
      .filter((child) => (child as React.ReactElement).type === Item)
      .map((child) => {
        const elem = child as React.ReactElement;
        return elem.props.value;
      });
  }, [children]);

  useEffect(() => {
    if (defaultValue && values.find((v) => v === defaultValue)) {
      onChangeHandler({ value: defaultValue });
    } else if (values.length > 0) {
      onChangeHandler({ value: values[0] });
    }
  }, [values, defaultValue, onChangeHandler]);

  // raycast doc: false when onSearchTextChange is specified, true otherwise.
  const filtering = _filtering || !onSearchTextChange;

  // TODO: handle DropdownSection
  const displayChildren = useMemo(() => {
    const itemElems = Children.toArray(children).filter((child) => (child as React.ReactElement).type === Item);

    if (typeof filtering === 'boolean' && filtering) {
      if (!internalSearchTextValue) {
        return itemElems;
      }

      return itemElems.filter((child) => {
        const elem = child as React.ReactElement;

        // TODO: use some search algorithm
        return (
          elem.props.value?.toLowerCase().includes(internalSearchTextValue.toLowerCase()) ||
          elem.props.title?.toLowerCase().includes(internalSearchTextValue.toLowerCase())
        );
      });
    }

    // TODO: Handle { keepSectionOrder: boolean } case
  }, [filtering, children, internalSearchTextValue]);

  return (
    <ElementTypes.Dropdown
      serializedKeys={[...serializedKeys, "onChangeEventName", "onSearchTextChangeEventName", "searchTextValue"]}
      onChangeEventName={onChangeEventName}
      searchTextValue={internalSearchTextValue}
      onSearchTextChangeEventName={onSearchTextChangeEventName}
      placeholder={placeholder || "Search..."}
      value={value || internalValue}
      {...rest}
    >
      {displayChildren}
    </ElementTypes.Dropdown>
  );
};

(Dropdown as any).Item = Item;
