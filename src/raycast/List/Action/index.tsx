import { Action as RaycastAction } from "raycast-original";

import { useCallback, useEffect, useId, useMemo } from "react";

import * as ElementTypes from "../../../elements/types";
import { createDebug } from "../../../utils/debug";
import { useWsServer } from "../../internal/WsServerProvider";
import { useNavigation } from "../../Navigation";

const debug = createDebug("blast:action");

type ActionPropKeys = (keyof RaycastAction.Props)[];
const serializesKeys: ActionPropKeys = ["autoFocus", "icon", "id", "shortcut", "style", "title"];

export const Action = (props: RaycastAction.Props) => {
  const { onAction } = props;
  const server = useWsServer();
  const actionId = useId();
  const actionEventName = useMemo(() => `action-${actionId}`, [actionId]);

  useEffect(() => {
    const runRegister = !!onAction && !!server;

    if (!runRegister) {
      return;
    }

    debug("registering action event listener", actionEventName);

    server.register(actionEventName, () => {
      onAction();

      return null;
    });

    return () => {
      server.removeListener(actionEventName, onAction);
    };
  }, [actionEventName, onAction, server]);

  return (
    <ElementTypes.Action
      serializesKeys={[...serializesKeys, "actionEventName"]}
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

  const onAction = useCallback(() => {
    // TODO: retrieve form values
  }, []);

  return <Action title={title} onAction={onAction} {...rest} />;
};

Action.SubmitForm = SubmitForm;
