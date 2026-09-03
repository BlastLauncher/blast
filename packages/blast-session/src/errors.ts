export class ProtocolSessionError extends Error {
  readonly code: string;
  readonly details: unknown | undefined;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ProtocolSessionError";
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Protocol session failed";
}
