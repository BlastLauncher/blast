
import { ElementTypes } from "@blastlauncher/renderer";
import { createDebug } from "@blastlauncher/utils";
import { Form } from "raycast-original";
import { FunctionComponent, forwardRef, useEffect, useId, useImperativeHandle, useMemo, useState, useCallback } from "react";

import { useServerEvent } from '../internal/hooks'
import { useWsServer } from "../internal/WsServerProvider";

import { useFormContext } from ".";

const debug = createDebug("blast:form:textfield");

type FormItemExposedMethods = {
  focus: () => void;
  reset: () => void;
};

type TextFieldPropKeys = (keyof Form.TextField.Props)[];
const serializedKeys: TextFieldPropKeys = [
  "autoFocus",
  "defaultValue",
  "error",
  "id",
  "info",
  "placeholder",
  "storeValue",
  "title",
  "value",
];

const _TextField = (props: Form.TextField.Props, ref: React.ForwardedRef<FormItemExposedMethods>) => {
  const textfieldId = useId();
  const { onChange, value, id } = props;

  const [internalValue, setInternalValue] = useState<string | undefined>(props.value);

  // const onBlurEventName = useMemo(() => `action:${textfieldId}:onBlur`, [textfieldId]);
  // const onFocusEventName = useMemo(() => `action:${textfieldId}:onFocus`, [textfieldId]);
  // const focusEventName = useMemo(() => `focus-${textfieldId}`, [textfieldId]);
  // const resetEventName = useMemo(() => `reset-${textfieldId}`, [textfieldId]);

  const onChangeEventName = useMemo(() => `action${textfieldId}onChange`, [textfieldId]);
  const { updateValue } = useFormContext();

  useEffect(() => {
    debug("updating internal value", internalValue);
    if (internalValue && onChange) {
      onChange(internalValue);
    }

    if (internalValue) {
      updateValue(id, internalValue);
    }
  }, [internalValue, onChange, id, updateValue]);

  const onChangeHandler = useCallback(({ value }: { value: string }) => {
    debug("triggering on change event listener", value);
    setInternalValue(value);

    return null;
  }, [setInternalValue]);

  useServerEvent(onChangeEventName, onChangeHandler);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        // noop for now
        debug("focus");
      },
      reset: () => {
        // noop for now
        debug("reset");
      },
    }),
    []
  );

  return (
    <ElementTypes.TextField
      serializedKeys={[...serializedKeys, "onChangeEventName"]}
      onChangeEventName={onChangeEventName}
      {...props}
    />
  );
};

export const TextField: FunctionComponent<Form.TextField.Props> = forwardRef(_TextField);
