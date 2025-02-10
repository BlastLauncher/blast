
import { ElementTypes } from "@blastlauncher/renderer/src";
import { createDebug } from "@blastlauncher/utils/src";
import type { Action as RaycastAction } from "raycast-original";
import { useCallback, useId, useMemo } from "react";

import { useFormContext } from "../Form";
import { useServerEvent } from "../internal/hooks";
import { useNavigation } from "../Navigation";

const debug = createDebug("blast:action");

type ActionPropKeys = (keyof RaycastAction.Props)[];
const serializedKeys: ActionPropKeys = ["autoFocus", "icon", "id", "shortcut", "style", "title"];

export const Action = (props: RaycastAction.Props) => {
  const { onAction } = props;
  const actionId = useId();
  const actionEventName = useMemo(() => `action${actionId}`, [actionId]);

  const fn = () => {
    onAction?.();

    return null;
  };
  useServerEvent(actionEventName, fn)

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
