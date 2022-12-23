import { useCallback, useEffect, useId, useMemo } from "react";
import { Action as RaycastAction } from "raycast-original";

import * as ElementTypes from "../../../elements/types";
import { useWsServer } from "../../internal/WsServerProvider";
import { createDebug } from "../../../utils/debug";
import { useNavigation } from "../../Navigation";

const debug = createDebug("blast:action");

export const Action = (props: RaycastAction.Props) => {
  const server = useWsServer();
  const actionId = useId();
  const actionEventName = useMemo(() => `action-${actionId}`, [actionId]);

  useEffect(() => {
    if (props.onAction && server) {
      debug("registering action event listener", actionEventName);
      server.on(actionEventName, props.onAction);
    }

    return () => {
      server?.removeAllListeners(actionEventName);
    };
  }, [actionEventName, props.onAction, server]);

  return (
    <ElementTypes.Action
      serializesKeys={["title", "autoFocus", "shortcut", "style", "actionEventName"]}
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
