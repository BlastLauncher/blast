import type { SceneShortcut, ToastActionPayload, ToastStyle } from "@blastlauncher/scene";

import type { VisibleV2Toast } from "./v2ToastModel";

export interface V2ToastStackProps {
  readonly toasts: readonly VisibleV2Toast[];
  readonly disabled: boolean;
  readonly onAction: (eventId: string) => void;
}

export function V2ToastStack({ toasts, disabled, onAction }: V2ToastStackProps): React.JSX.Element | null {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-20 flex w-[min(20rem,calc(100vw-2rem))] max-w-[20rem] flex-col gap-2"
      role="region"
    >
      {toasts.map((toast) => (
        <article
          aria-label={toast.title}
          className={`pointer-events-auto rounded-lg border bg-black/85 px-3 py-2.5 text-xs shadow-xl backdrop-blur ${styleClasses(toast.style)}`}
          data-toast-id={toast.toastId}
          data-toast-style={toast.style}
          key={toast.toastId}
        >
          <div className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${indicatorClass(toast.style)}`}
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-white">{toast.title}</h2>
              {toast.message !== undefined && <p className="mt-1 text-white/65">{toast.message}</p>}
            </div>
          </div>
          {(toast.primaryAction !== undefined || toast.secondaryAction !== undefined) && (
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              {toast.secondaryAction !== undefined && (
                <ToastActionButton action={toast.secondaryAction} disabled={disabled} onAction={onAction} secondary />
              )}
              {toast.primaryAction !== undefined && (
                <ToastActionButton action={toast.primaryAction} disabled={disabled} onAction={onAction} />
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function ToastActionButton({
  action,
  disabled,
  onAction,
  secondary = false,
}: {
  readonly action: ToastActionPayload;
  readonly disabled: boolean;
  readonly onAction: (eventId: string) => void;
  readonly secondary?: boolean;
}): React.JSX.Element {
  const shortcut = shortcutLabel(action.shortcut);
  return (
    <button
      aria-label={action.title}
      className={
        secondary
          ? "rounded-md border border-white/15 px-2 py-1 text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          : "rounded-md bg-white/15 px-2 py-1 font-medium text-white hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-45"
      }
      disabled={disabled}
      onClick={() => onAction(action.eventId)}
      title={shortcut === undefined ? undefined : `${action.title} (${shortcut})`}
      type="button"
    >
      {action.title}
      {shortcut !== undefined && <span className="ml-1 text-white/45">{shortcut}</span>}
    </button>
  );
}

function shortcutLabel(shortcut: SceneShortcut | undefined): string | undefined {
  if (shortcut === undefined) {
    return undefined;
  }
  return [...shortcut.modifiers, shortcut.key].join(" + ");
}

function styleClasses(style: ToastStyle): string {
  switch (style) {
    case "success":
      return "border-emerald-400/35";
    case "failure":
      return "border-red-400/40";
    case "animated":
      return "border-blue-400/35";
    default:
      return "border-white/15";
  }
}

function indicatorClass(style: ToastStyle): string {
  switch (style) {
    case "success":
      return "bg-emerald-300";
    case "failure":
      return "bg-red-300";
    case "animated":
      return "animate-pulse bg-blue-300";
    default:
      return "bg-white/50";
  }
}
