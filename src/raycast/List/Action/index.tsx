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
