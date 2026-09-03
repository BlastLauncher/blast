import type { ToastActionPayload, ToastPayload, ToastStyle } from "@blastlauncher/scene";

export const MAX_V2_TOASTS = 3;
export const V2_TOAST_TIMEOUTS_MS: Readonly<Record<ToastStyle, number | undefined>> = {
  neutral: 4_000,
  success: 4_000,
  failure: 6_000,
  animated: undefined,
};

const MAX_LOCALLY_EXPIRED_TOAST_IDS = 32;

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
  readonly locallyExpiredToastIds: readonly string[];
}

export function createV2ToastState(): V2ToastState {
  return { items: [], nextAnonymousId: 1, locallyExpiredToastIds: [] };
}

export function getV2ToastTimeoutMs(
  toast: Pick<VisibleV2Toast, "style" | "primaryAction" | "secondaryAction">,
): number | undefined {
  if (toast.primaryAction !== undefined || toast.secondaryAction !== undefined) {
    return undefined;
  }
  return V2_TOAST_TIMEOUTS_MS[toast.style];
}

export function applyV2ToastPayload(state: V2ToastState, payload: ToastPayload): V2ToastState {
  const operation = payload.operation ?? "show";

  if (operation === "hide") {
    if (payload.toastId === undefined) {
      return state;
    }
    const items = state.items.filter((toast) => toast.toastId !== payload.toastId);
    const locallyExpiredToastIds = withoutExpiredToastId(state.locallyExpiredToastIds, payload.toastId);
    return items.length === state.items.length && locallyExpiredToastIds === state.locallyExpiredToastIds
      ? state
      : { ...state, items, locallyExpiredToastIds };
  }

  const existingId = payload.toastId;
  if (operation === "update") {
    if (existingId === undefined) {
      return state;
    }
    const index = state.items.findIndex((toast) => toast.toastId === existingId);
    if (index === -1) {
      if (!state.locallyExpiredToastIds.includes(existingId)) {
        return state;
      }
      const nextToast = materializeToast(existingId, payload);
      return {
        ...state,
        items: [...state.items, nextToast].slice(-MAX_V2_TOASTS),
        locallyExpiredToastIds: withoutExpiredToastId(state.locallyExpiredToastIds, existingId),
      };
    }
    const nextToast = materializeToast(existingId, payload);
    const items = [...state.items];
    items[index] = nextToast;
    return {
      ...state,
      items,
      locallyExpiredToastIds: withoutExpiredToastId(state.locallyExpiredToastIds, existingId),
    };
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
    locallyExpiredToastIds: withoutExpiredToastId(state.locallyExpiredToastIds, toastId),
  };
}

export function expireV2Toast(state: V2ToastState, toast: VisibleV2Toast): V2ToastState {
  const index = state.items.findIndex((item) => item.toastId === toast.toastId);
  if (index === -1 || state.items[index] !== toast) {
    return state;
  }
  return {
    ...state,
    items: state.items.filter((item) => item !== toast),
    locallyExpiredToastIds: rememberExpiredToastId(state.locallyExpiredToastIds, toast.toastId),
  };
}

function withoutExpiredToastId(ids: readonly string[], toastId: string): readonly string[] {
  if (!ids.includes(toastId)) {
    return ids;
  }
  return ids.filter((id) => id !== toastId);
}

function rememberExpiredToastId(ids: readonly string[], toastId: string): readonly string[] {
  return [...ids.filter((id) => id !== toastId), toastId].slice(-MAX_LOCALLY_EXPIRED_TOAST_IDS);
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
