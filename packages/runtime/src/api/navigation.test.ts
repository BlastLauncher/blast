import { expect, test } from "bun:test";
import { createElement as h, useEffect, useState } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { Action, PushAction, useNavigation } from "./index.ts";
import { NavigationProvider, type Navigation } from "./navigation.ts";

function setup(component: ReturnType<typeof h>) {
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  root.render(h(NavigationProvider, { children: component }));
  return { root, latest: () => scene.root!, top: () => scene.root!.children.at(-1)!.children[0]! };
}

// @covers useNavigation
// @covers Navigation
// @covers Navigation.push
// @covers Navigation.pop
test("push/pop preserves state and ids, rejects covered/removed handlers, and calls onPop once", () => {
  let navigation!: Navigation;
  const events: string[] = [];
  function Counter() {
    navigation = useNavigation();
    const [count, setCount] = useState(0);
    useEffect(() => {
      events.push("mount");
      return () => {
        events.push("unmount");
      };
    }, []);
    return h(Action, { title: String(count), onAction: () => setCount((value) => value + 1) });
  }
  const { root, latest, top } = setup(h(Counter));
  const originalId = top().id;
  root.dispatch(originalId, "onAction", []);
  root.flush();
  expect(top().props.title).toBe("1");
  const stableNavigation = navigation;
  navigation.push(h(Counter), () => events.push("pop counter"));
  root.flush();
  expect(navigation).toBe(stableNavigation);
  expect(latest().props).toEqual({ depth: 2, pop: { $handler: "pop" } });
  expect(latest().children.map((entry) => entry.props.active)).toEqual([false, true]);
  expect(latest().children[0]!.children).toEqual([]);
  expect(top().props.title).toBe("0");
  expect(() => root.dispatch(originalId, "onAction", [])).toThrow("Unknown scene node");
  const pushedId = top().id;
  navigation.push(h("Detail", { markdown: "nested" }), () => events.push("pop detail"));
  root.flush();
  expect(latest().props.depth).toBe(3);
  expect(() => root.dispatch(pushedId, "onAction", [])).toThrow("Unknown scene node");
  navigation.pop();
  root.flush();
  expect(top().id).toBe(pushedId);
  root.dispatch(latest().id, "pop", []);
  root.flush();
  expect(top().id).toBe(originalId);
  expect(top().props.title).toBe("1");
  expect(() => root.dispatch(pushedId, "onAction", [])).toThrow("Unknown scene node");
  expect(latest().props).toEqual({ depth: 1 });
  navigation.pop();
  root.flush();
  expect(events).toEqual(["mount", "mount", "pop detail", "pop counter", "unmount"]);
  root.unmount();
  expect(events.at(-1)).toBe("unmount");
});

// @covers Action.Push
// @covers Action.Push.Props
// @covers Action.Push.Props.title
// @covers Action.Push.Props.target
// @covers Action.Push.Props.icon
// @covers Action.Push.Props.shortcut
// @covers Action.Push.Props.onPush
// @covers Action.Push.Props.onPop
// @covers PushAction
test("Action.Push keeps targets private, passes display props, and triggers lifecycle callbacks", () => {
  const events: string[] = [];
  function Target() {
    const { pop } = useNavigation();
    useEffect(
      () => () => {
        events.push("unmount");
      },
      [],
    );
    return h(Action, { title: "Return", onAction: pop });
  }
  const { root, top, latest } = setup(
    h(Action.Push, {
      title: "Open",
      target: h(Target),
      icon: "icon.png",
      shortcut: { modifiers: ["cmd"], key: "o" },
      onPush: () => events.push("push"),
      onPop: () => events.push("pop"),
    }),
  );
  expect(top().type).toBe("Action.Push");
  expect(top().props).toEqual({
    title: "Open",
    icon: "icon.png",
    shortcut: { modifiers: ["cmd"], key: "o" },
    onAction: { $handler: "onAction" },
  });
  expect(events).toEqual([]);
  root.dispatch(top().id, "onAction", []);
  root.flush();
  expect(top().props.title).toBe("Return");
  expect(events).toEqual(["push"]);
  root.dispatch(top().id, "onAction", []);
  root.flush();
  expect(events).toEqual(["push", "pop", "unmount"]);
  expect(latest().props.depth).toBe(1);
  root.unmount();
  root.render(
    h(NavigationProvider, {
      children: h(PushAction, {
        title: "Alias",
        target: h("Detail", { markdown: "alias target" }),
      }),
    }),
  );
  root.dispatch(top().id, "onAction", []);
  root.flush();
  expect(top().props.markdown).toBe("alias target");
  root.unmount();
});

test("stacks are isolated, batched pushes/pops compose, and shutdown does not call onPop", () => {
  let navigation!: Navigation;
  let pops = 0;
  function Command() {
    navigation = useNavigation();
    return h("Detail");
  }
  const a = setup(h(Command));
  const navA = navigation;
  const b = setup(h(Command));
  navA.push(h("Detail", { markdown: "first" }), () => {
    pops++;
  });
  navA.push(h("Detail", { markdown: "second" }), () => {
    pops++;
  });
  navA.pop();
  a.root.flush();
  expect(a.latest().props.depth).toBe(2);
  expect(b.latest().props.depth).toBe(1);
  expect(a.top().props.markdown).toBe("first");
  expect(pops).toBe(1);
  a.root.unmount();
  b.root.unmount();
  expect(pops).toBe(1);
});

function MissingProviderCommand() {
  useNavigation();
  return null;
}

test("useNavigation outside a view provider reports the missing command context", () => {
  const errors: unknown[] = [];
  const root = createSceneRoot({ publish() {}, onError: (error) => errors.push(error) });
  root.render(h(MissingProviderCommand));
  expect(errors[0]).toEqual(new Error("useNavigation requires a running view command"));
  root.unmount();
});
