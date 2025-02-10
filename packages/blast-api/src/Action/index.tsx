import { ElementTypes } from "@blastlauncher/renderer/src";
import { createDebug } from "@blastlauncher/utils/src";
import type { Action as RAction } from "raycast-original";
import { useCallback, useId, useMemo } from "react";

import { useFormContext } from "../Form";
import { useServerEvent } from "../internal/hooks";
import { useNavigation } from "../Navigation";

const debug = createDebug("blast:action");

type ActionPropKeys = (keyof RAction.Props)[];
const serializedKeys: ActionPropKeys = ["autoFocus", "icon", "id", "shortcut", "style", "title"];

export const Action = (props: RAction.Props) => {
  const { onAction } = props;
  const actionId = useId();
  const actionEventName = useMemo(() => `action${actionId}`, [actionId]);

  const fn = () => {
    onAction?.();

    return null;
  };
  useServerEvent(actionEventName, fn);

  return (
    <ElementTypes.Action
      serializedKeys={[...serializedKeys, "actionEventName"]}
      actionEventName={actionEventName}
      {...props}
    />
  );
};

const Push = (props: RAction.Push.Props) => {
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

const SubmitForm = (props: RAction.SubmitForm.Props<any>) => {
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

const CopyToClipboard = (props: RAction.CopyToClipboard.Props) => {
  const { title = "Copy to Clipboard", content, onCopy, ...rest } = props;

  const onAction = useCallback(() => {
    console.log(content, "TODO: copied to system clipboard");
    onCopy?.(content);
  }, [onCopy, content]);

  return <Action title={title} onAction={onAction} {...rest} />;
};

Action.CopyToClipboard = CopyToClipboard;

const OpenInBrowser = (props: RAction.OpenInBrowser.Props) => {
  const { title = "Open in Browser", url, onOpen, ...rest } = props;

  const onAction = useCallback(() => {
    console.log(url, "TODO: open url in browser");
    onOpen?.(url)
  }, [onOpen, url]);

  return <Action title={title} onAction={onAction} {...rest} />;
};

Action.OpenInBrowser = OpenInBrowser;
