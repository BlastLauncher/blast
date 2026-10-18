import type { JsonValue } from "./messages.ts";
import type { ModelRequest } from "./provider.ts";

// Only attachment data needs a non-JSON representation. Tag strings too, so
// authored data can never be confused with an encoded value.
export function encodeModelRequest(request: ModelRequest): Record<string, JsonValue> {
  return JSON.parse(
    JSON.stringify({
      ...request,
      messages: request.messages?.map((message) => ({
        ...message,
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map((part) => {
                if (part.type !== "file") return part;
                const data = part.data;
                const encoded =
                  typeof data === "string"
                    ? { kind: "string", value: data }
                    : data instanceof URL
                      ? { kind: "url", value: data.href }
                      : {
                          kind: data instanceof ArrayBuffer ? "buffer" : "bytes",
                          value: Array.from(
                            new Uint8Array(
                              data instanceof ArrayBuffer ? data : data.buffer,
                              data instanceof ArrayBuffer ? 0 : data.byteOffset,
                              data.byteLength,
                            ),
                          ),
                        };
                return { ...part, data: encoded };
              }),
      })),
    }),
  ) as Record<string, JsonValue>;
}

export function decodeModelRequest(value: Record<string, JsonValue>): ModelRequest {
  const request = value as unknown as ModelRequest;
  return {
    ...request,
    ...(request.messages === undefined
      ? {}
      : {
          messages: request.messages.map((message) => ({
            ...message,
            content:
              typeof message.content === "string"
                ? message.content
                : message.content.map((part) => {
                    if (part.type !== "file") return part;
                    const data = part.data as unknown as { kind: string; value: string | number[] };
                    if (data.kind === "string" && typeof data.value === "string")
                      return { ...part, data: data.value };
                    if (data.kind === "url" && typeof data.value === "string")
                      return { ...part, data: new URL(data.value) };
                    if (
                      (data.kind === "bytes" || data.kind === "buffer") &&
                      Array.isArray(data.value) &&
                      data.value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
                    ) {
                      const bytes = new Uint8Array(data.value);
                      return { ...part, data: data.kind === "buffer" ? bytes.buffer : bytes };
                    }
                    throw new Error("Invalid encoded attachment data");
                  }),
          })) as ModelRequest["messages"],
        }),
  } as ModelRequest;
}
