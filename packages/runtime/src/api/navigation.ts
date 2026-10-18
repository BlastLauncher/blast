import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { FeedbackScene } from "./feedback.ts";
import { closeRequest, subscribeCloseRequest } from "./window.ts";

export interface Navigation {
  push(component: ReactNode, onPop?: () => void): void;
  pop(): void;
}

/** `popToRoot` options from the declarations. */
export interface PopToRootOptions {
  /**
   * Raycast also clears the root search bar. Blast's headless clients own any
   * search-bar state, so the request is recorded on the `Navigation` scene
   * element (`props.popToRoot`) for clients to act on.
   */
  clearSearchBar?: boolean;
}

/** `clearSearchBar` options from the declarations. */
export interface ClearSearchBarOptions {
  /** Forces scrolling to the top of the list; the default is the client's. */
  forceScrollToTop?: boolean;
}

interface Entry {
  id: number;
  component: ReactNode;
  onPop: (() => void) | undefined;
}

const NavigationContext = createContext<Navigation | null>(null);

// `popToRoot()` is a module-level API without React context, so mounted
// providers register their stack; the most recent one answers. One command per
// runtime process in production; tests may hold several.
const stacks = new Set<(options?: PopToRootOptions) => void>();

// Like `closeMainWindow`, a `clearSearchBar()` request is module state: it is
// rendered by whichever `Navigation` is mounted and dropped with that scene, so
// a later command starts with a clean search bar.
let searchBarRequest: ClearSearchBarOptions | undefined;
const searchBarListeners = new Set<() => void>();

export function subscribeClearSearchBar(listener: () => void): () => void {
  searchBarListeners.add(listener);
  return () => {
    searchBarListeners.delete(listener);
    if (searchBarListeners.size === 0) searchBarRequest = undefined;
  };
}

/** The recorded request, or `undefined` while no clear was asked for. */
export function clearSearchBarRequest(): ClearSearchBarOptions | undefined {
  return searchBarRequest;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const entries = useRef<Entry[]>([]);
  const nextId = useRef(1);
  const [stack, setStack] = useState<Entry[]>([]);
  const [popToRootOptions, setPopToRootOptions] = useState<PopToRootOptions>();
  // A fresh object per `closeMainWindow()` call, so the snapshot identity
  // changes and `closeMainWindow` props follow the recorded request.
  const closeMainWindow = useSyncExternalStore(subscribeCloseRequest, closeRequest, closeRequest);
  const clearSearchBar = useSyncExternalStore(
    subscribeClearSearchBar,
    clearSearchBarRequest,
    clearSearchBarRequest,
  );
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
  const popToRootStack = useMemo(
    () => (options?: PopToRootOptions) => {
      setPopToRootOptions(options);
      // The root view is the provider's own children, not an entry (decision
      // 0003), so nothing above it is kept; onPops run topmost first, like
      // successive `pop()` calls.
      if (entries.current.length === 0) return;
      const popped = entries.current.toReversed();
      entries.current = [];
      setStack(entries.current);
      for (const entry of popped) entry.onPop?.();
    },
    [],
  );
  stacks.add(popToRootStack);
  useEffect(() => {
    return () => {
      stacks.delete(popToRootStack);
    };
  }, [popToRootStack]);
  return createElement(
    NavigationContext.Provider,
    { value: navigation },
    createElement(
      "Navigation",
      {
        depth: stack.length + 1,
        pop: stack.length ? navigation.pop : undefined,
        popToRoot: popToRootOptions,
        clearSearchBar,
        closeMainWindow,
      },
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

/** `popToRoot` from the declarations: pop the current command's stack to root. */
export async function popToRoot(options?: PopToRootOptions): Promise<void> {
  [...stacks].at(-1)?.(options);
}

/**
 * `clearSearchBar` from the declarations. Blast has no search-bar state, so
 * the request is recorded on the `Navigation` scene element
 * (`props.clearSearchBar`) for clients to act on, exactly like `closeMainWindow`
 * records its own request.
 */
export async function clearSearchBar(options: ClearSearchBarOptions = {}): Promise<void> {
  searchBarRequest = { ...options };
  for (const listener of searchBarListeners) listener();
}
