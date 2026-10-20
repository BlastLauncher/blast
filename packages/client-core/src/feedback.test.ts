// @covers showHUD
// @covers confirmAlert
import { expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { feedbackState } from "./feedback.ts";
import { HUD_DURATION_MS } from "./hud.ts";

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });
const scene = (...feedback: SceneNode[]): SceneMessage => ({
  type: "scene",
  revision: 1,
  root: node("Navigation", "nav", {}, [
    node("Navigation.Entry", "e", { active: true }),
    ...feedback,
  ]),
});

test("no feedback nodes means nothing visible", () => {
  expect(feedbackState(undefined)).toEqual({ toast: undefined, hud: undefined, alert: undefined });
  expect(feedbackState(scene())).toEqual({ toast: undefined, hud: undefined, alert: undefined });
  expect(
    feedbackState({ type: "scene", revision: 1, root: node("List", "l") }).hud,
  ).toBeUndefined();
});

test("a toast carries its style, text and actions in order", () => {
  const state = feedbackState(
    scene(
      node("Toast", "toast", { style: "failure", title: "Oops", message: "Disk full" }, [
        node("Toast.Action", "a", {
          name: "primaryAction",
          title: "Retry",
          shortcut: { key: "r" },
        }),
        node("Toast.Action", "b", { name: "secondaryAction", title: "Copy" }),
      ]),
    ),
  );
  expect(state.toast?.style).toBe("failure");
  expect([state.toast?.title, state.toast?.message]).toEqual(["Oops", "Disk full"]);
  expect(state.toast?.actions.map((a) => [a.name, a.title])).toEqual([
    ["primaryAction", "Retry"],
    ["secondaryAction", "Copy"],
  ]);
  expect(state.toast?.actions[0]?.shortcut).toEqual({ key: "r" });
});

test("a HUD reports its duration and the pop-to-root effect it requests", () => {
  const plain = feedbackState(scene(node("HUD", "hud", { title: "Copied" }))).hud;
  expect(plain).toMatchObject({
    title: "Copied",
    durationMs: HUD_DURATION_MS,
    popToRootType: "default",
    clearRootSearch: false,
  });
  const immediate = feedbackState(
    scene(node("HUD", "hud", { title: "Done", popToRootType: "immediate", clearRootSearch: true })),
  ).hud;
  expect(immediate).toMatchObject({ popToRootType: "immediate", clearRootSearch: true });
  expect(
    feedbackState(scene(node("HUD", "hud", { title: "x", popToRootType: "suspended" }))).hud
      ?.popToRootType,
  ).toBe("suspended");
  expect(
    feedbackState(scene(node("HUD", "hud", { title: "x", popToRootType: "bogus" }))).hud
      ?.popToRootType,
  ).toBe("default");
});

const alert = (extra: SceneNode["props"]) =>
  feedbackState(
    scene(
      node("Alert", "alert", { title: "Delete?", message: "Gone forever", ...extra }, [
        node("Alert.Action", "p", {
          name: "primaryAction",
          title: "Delete",
          style: "destructive",
        }),
        node("Alert.Action", "d", { name: "dismissAction", title: "Cancel" }),
      ]),
    ),
  ).alert;
const remembered = alert({ rememberUserChoice: true });

test("an alert exposes its actions and whether the choice is remembered", () => {
  expect(remembered?.rememberUserChoice).toBe(true);
  expect(remembered?.primary).toMatchObject({ title: "Delete", style: "destructive" });
  expect(remembered?.dismiss).toMatchObject({ title: "Cancel", style: "default" });
  expect([remembered?.title, remembered?.message]).toEqual(["Delete?", "Gone forever"]);
  expect(alert({})?.rememberUserChoice).toBe(false);
});
