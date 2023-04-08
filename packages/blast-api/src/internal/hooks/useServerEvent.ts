import { useEffect } from "react";

import { useWsServer } from "../WsServerProvider";

type NonUndefined<T> = T extends undefined ? never : T;

export function useServerEvent (eventName: string, handler: (data: any) => NonUndefined<any>) {
  const server = useWsServer();

  useEffect(() => {
    const runRegister = !!server;

    if (!runRegister) {
      return;
    }

    server.register(eventName, handler);

    return () => {
      delete (server as any).namespaces["/"].rpc_methods[eventName];
      // server.removeListener(onChangeEventName, fn);
    };
  }, [eventName, handler, server]);
}
