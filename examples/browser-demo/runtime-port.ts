export type RuntimePortRequest = { type: "blast-port-request" };

export function isRuntimePortRequest(value: unknown): value is RuntimePortRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "blast-port-request"
  );
}

export function acceptsRuntimePortRequest(
  source: unknown,
  expectedSource: unknown,
  transferred: boolean,
  data: unknown,
): boolean {
  return !transferred && source === expectedSource && isRuntimePortRequest(data);
}
