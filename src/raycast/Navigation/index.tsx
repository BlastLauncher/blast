import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { useWsServer } from "../internal/WsServerProvider";

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
  const [stack, setStack] = useState<React.ReactNode[]>([]);
  const server = useWsServer();

  const push = useCallback(
    (component: React.ReactNode) => {
      setStack((previous) => [...previous, component]);
    },
    [setStack]
  );

  const pop = useCallback(() => {
    setStack((previous) => previous.slice(0, -1));
  }, [setStack]);

  useEffect(() => {
    if (!server) {
      return;
    }

    server.register("blast-global:pop", () => {
      pop();

      return null;
    });

    return () => {
      server.removeListener("blast-global:pop", pop);
    };
  }, [pop, server]);

  return (
    <NavigationContext.Provider value={{ push, pop }}>{stack[stack.length - 1] || children}</NavigationContext.Provider>
  );
};

export const useNavigation = () => useContext(NavigationContext);
