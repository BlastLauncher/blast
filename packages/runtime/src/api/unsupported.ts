export class UnsupportedApiError extends Error {
  readonly code = "UNSUPPORTED_API";
  readonly path: string;

  constructor(path: string) {
    super(`Unsupported API in Blast: ${path}`);
    this.name = "UnsupportedApiError";
    this.path = path;
  }
}

export type ApiStub = {
  (...args: unknown[]): never;
  new (...args: unknown[]): ApiStub;
  [key: string]: ApiStub;
};

/** Preserve real implementations, while lazily supplying missing namespace members.
 * Probe properties used by React and Promise resolution must retain normal semantics.
 */
export function withUnsupported<T>(path: string, implemented?: T): T & Record<string, ApiStub> {
  const target =
    implemented ??
    function () {
      throw new UnsupportedApiError(path);
    };
  if ((typeof target !== "object" || target === null) && typeof target !== "function")
    return target as T & Record<string, ApiStub>;
  const children = new Map<string, unknown>();
  return new Proxy(target, {
    get(value, key, receiver) {
      if (
        typeof key !== "string" ||
        key === "then" ||
        key === "prototype" ||
        key.startsWith("_") ||
        key.startsWith("$") ||
        key === "displayName" ||
        key === "defaultProps" ||
        key === "contextTypes" ||
        key === "childContextTypes" ||
        key === "contextType" ||
        key === "getDerivedStateFromProps" ||
        key === "getDerivedStateFromError" ||
        key === "propTypes" ||
        key in Function.prototype
      )
        return Reflect.get(value, key, receiver);
      const child = Reflect.get(value, key, receiver);
      if (
        key in value &&
        (child === null || (typeof child !== "object" && typeof child !== "function"))
      )
        return child;
      if (!children.has(key)) {
        children.set(key, withUnsupported(`${path}.${key}`, child));
      }
      return children.get(key);
    },
  }) as T & Record<string, ApiStub>;
}

export function createApi<T extends object>(implemented: T) {
  return <K extends string>(path: K) =>
    withUnsupported(path, Reflect.get(implemented, path)) as K extends keyof T
      ? T[K] & Record<string, ApiStub>
      : ApiStub;
}
