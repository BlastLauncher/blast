import type {
  CapabilityRequestMessage,
  CapabilityResultMessage,
  JsonValue,
} from "@blastlauncher/protocol";

export type CapabilityHandler = (params: JsonValue) => JsonValue | void | Promise<JsonValue | void>;
export type Broker = (request: CapabilityRequestMessage) => Promise<CapabilityResultMessage>;

export function createBroker(handlers: Record<string, CapabilityHandler> = {}): Broker {
  const grants = new Map(Object.entries(handlers));
  return async ({ id, name, params }) => {
    const handler = grants.get(name);
    if (!handler) {
      return {
        type: "capability.result",
        id,
        ok: false,
        error: { code: "denied", message: `Capability denied: ${name}` },
      };
    }
    try {
      return { type: "capability.result", id, ok: true, value: (await handler(params)) ?? null };
    } catch (error) {
      return {
        type: "capability.result",
        id,
        ok: false,
        error: { code: "failed", message: error instanceof Error ? error.message : String(error) },
      };
    }
  };
}
