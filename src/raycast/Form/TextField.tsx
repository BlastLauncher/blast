import { Form } from "raycast-original";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useState } from "react";

import * as ElementTypes from "../../elements/types";
import { createDebug } from "../../utils/debug";
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

  const server = useWsServer();

  useEffect(() => {
    const runRegister = !!server;

    if (!runRegister) {
      return;
    }

    debug("registering on change event listener", onChangeEventName);

    const fn: any = ({ value }: { value: string }) => {
      debug("triggering on change event listener", value);
      setInternalValue(value);

      return null;
    };

    server.register(onChangeEventName, fn);

    return () => {
      debug("unregistering on change event listener", onChangeEventName);
      delete (server as any).namespaces["/"].rpc_methods[onChangeEventName];
      // server.removeListener(onChangeEventName, fn);
    };
  }, [onChangeEventName, value, server]);

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

export const TextField = forwardRef(_TextField);
