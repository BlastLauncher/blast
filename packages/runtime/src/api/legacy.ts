// Deprecated top-level helpers from `@raycast/api`: id generation and the
// legacy `render` entry point that mounted a command's root element itself.
import { useRef, type ReactNode } from "react";

/** @deprecated Add `nanoid` as a dependency and use it instead. */
export function randomId(): string {
  return crypto.randomUUID();
}

/** @deprecated Use `useRef` with `nanoid`. */
export function useId(): string {
  // One id per component instance, stable across re-renders.
  const id = useRef<string | undefined>(undefined);
  id.current ??= randomId();
  return id.current;
}

let mount: ((element: ReactNode) => void) | undefined;

/** Installs the command-root renderer before the runtime imports an extension. */
export function setRenderMount(next: ((element: ReactNode) => void) | undefined): void {
  mount = next;
}

/** @deprecated Use `export default function Command() { ... }` instead. */
export function render(element: ReactNode): void {
  if (!mount) throw new Error("render: no command root is mounted");
  mount(element);
}
