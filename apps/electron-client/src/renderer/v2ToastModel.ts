import type { ToastActionPayload, ToastPayload, ToastStyle } from "@blastlauncher/scene";

export const MAX_V2_TOASTS = 3;

export interface VisibleV2Toast {
  readonly toastId: string;
  readonly title: string;
  readonly message?: string;
  readonly style: ToastStyle;
  readonly primaryAction?: ToastActionPayload;
  readonly secondaryAction?: ToastActionPayload;
}

export interface V2ToastState {
  readonly items: readonly VisibleV2Toast[];
  readonly nextAnonymousId: number;
}

export function createV2ToastState(): V2ToastState {
  return { items: [], nextAnonymousId: 1 };
}

export function applyV2ToastPayload(state: V2ToastState, payload: ToastPayload): V2ToastState {
  const operation = payload.operation ?? "show";

  if (operation === "hide") {
    if (payload.toastId === undefined) {
      return state;
    }
    const items = state.items.filter((toast) => toast.toastId !== payload.toastId);
    return items.length === state.items.length ? state : { ...state, items };
  }

  const existingId = payload.toastId;
  if (operation === "update") {
    if (existingId === undefined) {
      return state;
    }
    const index = state.items.findIndex((toast) => toast.toastId === existingId);
    if (index === -1) {
      return state;
    }
    const nextToast = materializeToast(existingId, payload);
    const items = [...state.items];
    items[index] = nextToast;
    return { ...state, items };
  }

  const toastId = existingId ?? `v2-anonymous-toast-${state.nextAnonymousId}`;
  const nextToast = materializeToast(toastId, payload);
  const existingIndex = state.items.findIndex((toast) => toast.toastId === toastId);
  const items = [...state.items];
  if (existingIndex === -1) {
    items.push(nextToast);
  } else {
    items[existingIndex] = nextToast;
  }

  return {
    items: items.slice(-MAX_V2_TOASTS),
    nextAnonymousId: existingId === undefined ? state.nextAnonymousId + 1 : state.nextAnonymousId,
  };
}

function materializeToast(toastId: string, payload: ToastPayload): VisibleV2Toast {
  return {
    toastId,
    title: payload.title ?? "Toast",
    ...(payload.message === undefined ? {} : { message: payload.message }),
    style: payload.style ?? "neutral",
    ...(payload.primaryAction === undefined ? {} : { primaryAction: payload.primaryAction }),
    ...(payload.secondaryAction === undefined ? {} : { secondaryAction: payload.secondaryAction }),
  };
}
