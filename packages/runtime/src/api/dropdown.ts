import { Children, createElement, isValidElement, useEffect, useRef, useState } from "react";
import { requestCapability } from "./capability.ts";
import { environment } from "./environment.ts";
import type { ListDropdownProps } from "./list.ts";

// Search/filtering/throttle are client presentation requests, like List/Grid's.
export function useDropdown(type: string, props: ListDropdownProps) {
  const [selection, setSelection] = useState(props.defaultValue);
  const edited = useRef(false);
  const callback = useRef(props.onChange);
  callback.current = props.onChange;
  const key = `blast:dropdown:${JSON.stringify([environment.commandName, type, props.id ?? "default"])}`;
  useEffect(() => {
    if (!props.storeValue || props.value !== undefined) return;
    let mounted = true;
    void requestCapability("storage.get", { scope: "blast:dropdown", key })
      .then((value) => {
        if (!mounted || edited.current || typeof value !== "string") return;
        const contains = (children: ListDropdownProps["children"]): boolean =>
          Children.toArray(children).some((child) => {
            if (
              !isValidElement<{ value?: string; children?: ListDropdownProps["children"] }>(child)
            )
              return false;
            return child.props.value === value || contains(child.props.children);
          });
        if (contains(props.children)) {
          setSelection(value);
          callback.current?.(value);
        }
      })
      .catch((error: unknown) => console.error("Dropdown restore failed", error));
    return () => {
      mounted = false;
    };
  }, [key, props.storeValue, props.value]);
  const onChange = (value: string) => {
    edited.current = true;
    if (props.value === undefined) setSelection(value);
    if (props.storeValue) {
      void requestCapability("storage.set", { scope: "blast:dropdown", key, value }).catch(
        (error: unknown) => console.error("Dropdown save failed", error),
      );
    }
    return props.onChange?.(value);
  };
  return createElement(type, {
    ...props,
    value: props.value ?? selection,
    onChange:
      props.onChange || props.value === undefined || props.storeValue ? onChange : undefined,
  });
}
