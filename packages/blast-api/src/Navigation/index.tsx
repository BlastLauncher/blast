import { ElementTypes } from "@blastlauncher/renderer/src";
import type React from "react";
import { Fragment, createContext, useCallback, useContext, useEffect, useState } from "react";

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

export const NavigationProvider = ({ children }: { children?: React.ReactNode }) => {
  const [stack, setStack] = useState<React.ReactNode[]>([]);
  const server = useWsServer();

  const push = useCallback(
    (component: React.ReactNode) => {
      setStack((previous) => [...previous, component]);
    },
    []
  );

  const pop = useCallback(() => {
    setStack((previous) => previous.slice(0, -1));
  }, []);

  useEffect(() => {
    if (!server) {
      return;
    }

    server.register("blast-global:pop", () => {
      pop();

      return null;
    });

    return () => {
      delete (server as any).namespaces["/"].rpc_methods["blast-global:pop"];

      // server.removeListener("blast-global:pop", pop);
    };
  }, [pop, server]);

  const stacksLength = stack.length;

  return (
    <NavigationContext.Provider value={{ push, pop }}>
      <ElementTypes.NavigationRoot stacksLength={stacksLength} serializedKeys={["stacksLength"]}>
        {children}

        {stack.map((component, index) => component && <Fragment key={`navigation_${index}`}>{component}</Fragment>)}
      </ElementTypes.NavigationRoot>
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => useContext(NavigationContext);
