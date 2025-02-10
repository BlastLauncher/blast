import { AsyncLocalStorage } from "node:async_hooks";

import { type Environment, LaunchType } from "../LaunchType";

const asyncLocalStorage = new AsyncLocalStorage<Environment>();

const defaultEnvironment: Environment = {
  assetsPath: "",
  commandMode: "view",
  commandName: "",
  extensionName: "",
  isDevelopment: false,
  launchType: LaunchType.UserInitiated,
  raycastVersion: "",
  supportPath: "",
  textSize: "medium",
  theme: "dark",
};

export const environment: Environment = new Proxy(defaultEnvironment, {
  get(target, prop, receiver) {
    const store = asyncLocalStorage.getStore();
    const data = store || target;
    return Reflect.get(data, prop, receiver);
  },
  set(target, prop, value, receiver) {
    const store = asyncLocalStorage.getStore();
    const data = store || target;
    return Reflect.set(data, prop, value, receiver);
  },
});

export function prepareEnvironment<T>(env: Partial<Environment>, callback: () => T): T {
  const newEnv = { ...defaultEnvironment, ...env };
  return asyncLocalStorage.run(newEnv, callback);
}
