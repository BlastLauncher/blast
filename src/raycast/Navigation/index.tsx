import React, { createContext, useCallback, useContext } from "react";

export const NavigationContext = createContext<{
  push: (component: React.ReactNode) => void;
  pop: () => void;
}>({
  push: () => {
    /* noop */
  },
  pop: () => {
    /* noop */
  },
});

export const NavigationProvider = ({ children }: { children: React.ReactNode }) => {
  const [stack, setStack] = React.useState<React.ReactNode[]>([]);

  const push = useCallback(
    (component: React.ReactNode) => {
      setStack((previous) => [...previous, component]);
    },
    [setStack]
  );

  const pop = useCallback(() => {
    setStack((previous) => previous.slice(0, -1));
  }, [setStack]);

  return (
    <NavigationContext.Provider value={{ push, pop }}>{stack[stack.length - 1] || children}</NavigationContext.Provider>
  );
};

export const useNavigation = () => useContext(NavigationContext);
