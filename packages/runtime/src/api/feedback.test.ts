import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneNode } from "../reconciler/index.ts";
import { NavigationProvider, useNavigation, type Navigation } from "./navigation.ts";
import {
  Alert,
  Toast,
  ToastStyle,
  AlertActionStyle,
  showToast,
  showHUD,
  confirmAlert,
  closeMainWindow,
} from "./index.ts";

function setup() {
  let scene!: SceneNode;
  let navigation!: Navigation;
  function Command() {
    navigation = useNavigation();
    return h("List");
  }
  const root = createSceneRoot({
    publish: (value) => {
      scene = value.root!;
    },
  });
  root.render(h(NavigationProvider, { children: h(Command) }));
  return {
    root,
    navigation: () => navigation,
    feedback: () => scene.children.slice(1),
    node: () => scene.children[1]!,
  };
}

// @covers showToast
// @covers Toast
// @covers Toast.constructor
// @covers Toast.show
// @covers Toast.hide
// @covers Toast.title
// @covers Toast.message
// @covers Toast.style
// @covers Toast.Options
// @covers Toast.Options.title
// @covers Toast.Options.message
// @covers Toast.Options.style
// @covers Toast.Style
// @covers Toast.Style.Success
// @covers Toast.Style.Failure
// @covers Toast.Style.Animated
// @covers ToastStyle
// @covers ToastStyle.Success
// @covers ToastStyle.Failure
// @covers ToastStyle.Animated
test("toast creation, mutations, replacement, hide and legacy signatures publish scenes", async () => {
  const { root, node, feedback } = setup();
  const shown = showToast({ title: "Loading", message: "Before", style: Toast.Style.Animated });
  root.flush();
  const toast = await shown;
  expect(toast).toBeInstanceOf(Toast);
  expect(node().props).toEqual({ title: "Loading", message: "Before", style: "ANIMATED" });
  toast.title = "Done";
  toast.message = "After";
  toast.style = Toast.Style.Success;
  root.flush();
  expect([toast.title, toast.message, toast.style]).toEqual(["Done", "After", "SUCCESS"]);
  expect(node().props).toEqual({ title: "Done", message: "After", style: "SUCCESS" });
  const replacement = showToast(ToastStyle.Failure, "Failed", "Legacy");
  root.flush();
  const second = await replacement;
  await toast.hide();
  toast.title = "Hidden mutation";
  expect(node().props).toEqual({ title: "Failed", message: "Legacy", style: "FAILURE" });
  const hidden = second.hide();
  root.flush();
  await hidden;
  expect(feedback()).toEqual([]);
  const direct = new Toast({ title: "Default" });
  expect(direct.style).toBe("SUCCESS");
  const reshown = direct.show();
  root.flush();
  await reshown;
  expect(node().props.title).toBe("Default");
  direct.message = undefined;
  root.flush();
  expect(node().props.message).toBeUndefined();
  root.unmount();
});

// @covers Toast.primaryAction
// @covers Toast.secondaryAction
// @covers Toast.Options.primaryAction
// @covers Toast.Options.secondaryAction
// @covers Toast.ActionOptions
// @covers Toast.ActionOptions.title
// @covers Toast.ActionOptions.shortcut
// @covers Toast.ActionOptions.onAction
test("toast actions receive the original instance and can be changed or removed", async () => {
  const { root, node } = setup();
  const called: unknown[] = [];
  const action = {
    title: "Retry",
    shortcut: { key: "r", modifiers: ["cmd"] },
    onAction: (value: unknown) => {
      called.push(value);
    },
  };
  const shown = showToast({ title: "Actions", primaryAction: action, secondaryAction: action });
  root.flush();
  const toast = await shown;
  expect(toast.primaryAction).toBe(action);
  expect(toast.secondaryAction).toBe(action);
  for (const child of node().children) {
    expect(child.props.shortcut).toEqual(action.shortcut);
    root.dispatch(child.id, "onAction", []);
  }
  expect(called).toEqual([toast, toast]);
  toast.primaryAction = { ...action, title: "Updated" };
  toast.secondaryAction = undefined;
  root.flush();
  expect(node().children.map((child) => child.props.title)).toEqual(["Updated"]);
  root.unmount();
});

// @covers showHUD
test("HUD resolves after publication and records window options", async () => {
  const { root, node } = setup();
  const shown = showHUD("Copied", { clearRootSearch: true, popToRootType: "immediate" });
  let settled = false;
  void shown.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  root.flush();
  await shown;
  expect(node()).toMatchObject({
    type: "HUD",
    props: { title: "Copied", clearRootSearch: true, popToRootType: "immediate" },
  });
  root.unmount();
});

// @covers confirmAlert partial
// @covers Alert
// @covers Alert.Options partial
// @covers Alert.Options.title
// @covers Alert.Options.message
// @covers Alert.Options.icon
// @covers Alert.Options.primaryAction
// @covers Alert.Options.dismissAction
// @covers Alert.Options.rememberUserChoice partial
// @covers Alert.ActionOptions
// @covers Alert.ActionOptions.title
// @covers Alert.ActionOptions.style
// @covers Alert.ActionOptions.onAction
// @covers Alert.ActionStyle
// @covers Alert.ActionStyle.Default
// @covers Alert.ActionStyle.Cancel
// @covers Alert.ActionStyle.Destructive
// @covers AlertActionStyle
// @covers AlertActionStyle.Default
// @covers AlertActionStyle.Cancel
// @covers AlertActionStyle.Destructive
test("alert events confirm/dismiss once, run callbacks, and queue concurrent prompts", async () => {
  const { root, node, feedback } = setup();
  const called: string[] = [];
  expect(Object.values(AlertActionStyle)).toEqual(["default", "cancel", "destructive"]);
  const first = confirmAlert({
    title: "Delete?",
    message: "Permanent",
    icon: "trash.png",
    primaryAction: {
      title: "Delete",
      style: Alert.ActionStyle.Destructive,
      onAction: () => {
        called.push("primary");
      },
    },
    dismissAction: {
      title: "Keep",
      style: Alert.ActionStyle.Cancel,
      onAction: () => {
        called.push("dismiss");
      },
    },
  });
  const second = confirmAlert({
    title: "Next?",
    rememberUserChoice: true,
    dismissAction: {
      title: "No",
      onAction: () => {
        called.push("dismiss");
      },
    },
  });
  root.flush();
  expect(node().props).toEqual({ title: "Delete?", message: "Permanent", icon: "trash.png" });
  expect(node().children[0]!.props).toMatchObject({ title: "Delete", style: "destructive" });
  expect(node().children[1]!.props).toMatchObject({ title: "Keep", style: "cancel" });
  const original = node().children[0]!;
  root.dispatch(original.id, "onAction", []);
  root.dispatch(original.id, "onAction", []);
  root.flush();
  expect(await first).toBe(true);
  expect(called).toEqual(["primary"]);
  expect(node().props.title).toBe("Next?");
  // The flag is carried for the client; Blast does not persist the answer yet.
  expect(node().props.rememberUserChoice).toBe(true);
  expect(() => root.dispatch(original.id, "onAction", [])).toThrow("Unknown scene node");
  expect(node().children[0]!.props).toMatchObject({ title: "OK", style: "default" });
  root.dispatch(node().children[1]!.id, "onAction", []);
  root.flush();
  expect(await second).toBe(false);
  expect(called).toEqual(["primary", "dismiss"]);
  expect(feedback()).toEqual([]);
  root.unmount();
});

test("feedback and pending alerts survive navigation push/pop without remounting", async () => {
  const { root, navigation, feedback } = setup();
  const shown = showToast({ title: "Still visible" });
  const answer = confirmAlert({ title: "Still waiting" });
  root.flush();
  await shown;
  const before = feedback().map((node) => node.id);
  navigation().push(h("Detail"));
  root.flush();
  expect(
    feedback()
      .slice(1)
      .map((node) => node.id),
  ).toEqual(before);
  navigation().pop();
  root.flush();
  expect(feedback().map((node) => node.id)).toEqual(before);
  expect(feedback().map((node) => node.props.title)).toEqual(["Still visible", "Still waiting"]);
  root.dispatch(feedback()[1]!.children[0]!.id, "onAction", []);
  root.flush();
  expect(await answer).toBe(true);
  root.unmount();
});

// @covers showToast
// @covers Toast.show
// @covers Toast.hide
// @covers showHUD
// @covers closeMainWindow
test("feedback promises settle with nothing mounted", async () => {
  const toast = await showToast({ title: "No scene" });
  await toast.hide();
  await toast.show();
  await toast.hide();
  await showHUD("No scene");
  await closeMainWindow();
  // Mounting later still publishes the recorded feedback.
  const { root, node } = setup();
  expect(node().props.title).toBe("No scene");
  root.unmount();
}, 500);
