import { Alert, Cache, Form, Keyboard, Toast } from "../../dist/index.js";
import type { FormItemRef } from "../../dist/index.js";

const alertStyle: Alert.ActionStyle = Alert.ActionStyle.Destructive;
const alertOptions: Alert.Options = {
  title: "Confirm",
  primaryAction: {
    title: "Continue",
    style: alertStyle,
  },
};
const alertAction: Alert.ActionOptions = alertOptions.primaryAction as Alert.ActionOptions;

const cacheOptions: Cache.Options = { namespace: "declaration-test" };
const cacheSubscriber: Cache.Subscriber = () => {};
const cacheSubscription: Cache.Subscription = () => {};

const keyboardShortcut: Keyboard.Shortcut = Keyboard.Shortcut.Common.New;
const keyboardModifier: Keyboard.KeyModifier = "cmd";
const keyboardKey: Keyboard.KeyEquivalent = "return";

const formReference: Form.ItemReference = {
  focus: () => {},
  reset: () => {},
};
const topLevelFormReference: FormItemRef = formReference;

const toastStyle: Toast.Style = Toast.Style.Success;
const toastOptions: Toast.Options = {
  title: "Saved",
  style: toastStyle,
  primaryAction: {
    title: "Undo",
    onAction: (toast) => {
      void toast.hide();
    },
  },
};
const toastAction: Toast.ActionOptions = toastOptions.primaryAction as Toast.ActionOptions;

void alertAction;
void cacheOptions;
void cacheSubscriber;
void cacheSubscription;
void keyboardShortcut;
void keyboardModifier;
void keyboardKey;
void topLevelFormReference;
void toastAction;
