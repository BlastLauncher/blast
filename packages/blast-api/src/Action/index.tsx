import type { Action as RaycastAction } from "@raycast/api";
import { ElementTypes } from "blast-renderer";
import { createDebug } from "blast-utils";
import { useCallback, useEffect, useId, useMemo } from "react";

import { useFormContext } from "../Form";
import { useWsServer } from "../internal/WsServerProvider";
import { useNavigation } from "../Navigation";

const debug = createDebug("blast:action");

type ActionPropKeys = (keyof RaycastAction.Props)[];
const serializedKeys: ActionPropKeys = ["autoFocus", "icon", "id", "shortcut", "style", "title"];

export const Action = (props: RaycastAction.Props) => {
  const { onAction } = props;
  const server = useWsServer();
  const actionId = useId();
  const actionEventName = useMemo(() => `action${actionId}`, [actionId]);

  useEffect(() => {
    const runRegister = !!onAction && !!server;

    if (!runRegister) {
      return;
    }

    debug("registering action event listener", actionEventName);

    const fn = () => {
      onAction();

      return null;
    };

    server.register(actionEventName, fn);

    return () => {
      debug("unregistering action event listener", actionEventName);

      delete (server as any).namespaces["/"].rpc_methods[actionEventName];

      // server.removeListener(actionEventName, fn);
    };
  }, [actionEventName, onAction, server]);

  return (
    <ElementTypes.Action
      serializedKeys={[...serializedKeys, "actionEventName"]}
      actionEventName={actionEventName}
      {...props}
    />
  );
};

const Push = (props: RaycastAction.Push.Props) => {
  const { target, onPush, ...rest } = props;
  const { push } = useNavigation();

  const onAction = useCallback(() => {
    push(target);

    if (onPush) {
      onPush();
    }
  }, [onPush, push, target]);

  return <Action onAction={onAction} {...rest} />;
};

Action.Push = Push;

const SubmitForm = (props: RaycastAction.SubmitForm.Props<any>) => {
  const { onSubmit, title = "Submit Form", ...rest } = props;
  const { formValues } = useFormContext();

  const onAction = useCallback(() => {
    if (onSubmit) {
      debug("submitting form", formValues);
      onSubmit(formValues);
    }
  }, [formValues, onSubmit]);

  return <Action title={title} onAction={onAction} {...rest} />;
};

Action.SubmitForm = SubmitForm;
