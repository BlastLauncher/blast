import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { FeedbackScene } from "./feedback.ts";

export interface Navigation {
  push(component: ReactNode, onPop?: () => void): void;
  pop(): void;
}

interface Entry {
  id: number;
  component: ReactNode;
  onPop: (() => void) | undefined;
}

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const entries = useRef<Entry[]>([]);
  const nextId = useRef(1);
  const [stack, setStack] = useState<Entry[]>([]);
  const navigation = useMemo<Navigation>(
    () => ({
      push(component, onPop) {
        entries.current = [...entries.current, { id: nextId.current++, component, onPop }];
        setStack(entries.current);
      },
      pop() {
        const entry = entries.current.at(-1);
        if (!entry) return;
        entries.current = entries.current.slice(0, -1);
        setStack(entries.current);
        entry.onPop?.();
      },
    }),
    [],
  );
  return createElement(
    NavigationContext.Provider,
    { value: navigation },
    createElement(
      "Navigation",
      { depth: stack.length + 1, pop: stack.length ? navigation.pop : undefined },
      createElement("Navigation.Entry", { key: 0, active: stack.length === 0 }, children),
      ...stack.map((entry, index) =>
        createElement(
          "Navigation.Entry",
          { key: entry.id, active: index === stack.length - 1 },
          entry.component,
        ),
      ),
      createElement(FeedbackScene, { key: "feedback" }),
    ),
  );
}

export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("useNavigation requires a running view command");
  return navigation;
}
