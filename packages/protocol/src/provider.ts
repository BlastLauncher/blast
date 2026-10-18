import type { JsonValue } from "./messages.ts";

export type GetModels<TIcon = unknown> = () =>
  | RegisteredModel<TIcon>[]
  | Promise<RegisteredModel<TIcon>[]>;

export type RegisteredModel<TIcon = unknown> = {
  id: string;
  title: string;
  isLocal?: boolean;
  icon?: TIcon;
  description?: string;
  capabilities?: {
    systemMessage?: {
      supported: boolean;
    };
    temperature?: {
      supported: boolean;
    };
    vision?: {
      mediaTypes: Array<"image/png" | "image/jpeg" | "image/webp" | "image/gif">;
    };
    tools?: {
      supported: boolean;
    };
    streaming?: {
      supported: boolean;
    };
    reasoningEffort?: {
      supported: boolean;
      options: string[];
      default: string;
    };
  };
  contextWindow?: number;
  sizeInBytes?: number;
};

export type ModelAssistantMessageContent = Array<
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      data: string | Uint8Array | ArrayBuffer | URL;
      mediaType: string;
    }
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
>;

export type ModelFullStream = ReadableStream<ModelStreamPart> | AsyncIterable<ModelStreamPart>;

export type ModelMessage =
  | {
      role: "system";
      content: string;
    }
  | {
      role: "user";
      content: ModelUserMessageContent;
    }
  | {
      role: "assistant";
      content: ModelAssistantMessageContent;
    }
  | {
      role: "tool";
      content: Array<{
        type: "tool-result";
        toolCallId: string;
        toolName: string;
        input?: unknown;
        output: {
          type: "json";
          value: JsonValue;
        };
      }>;
    };

export type ModelProviderOptions = Record<string, Record<string, unknown>> & {
  raycast: Record<string, unknown> & {
    locale: string;
    currentDate: string;
    reasoningEffort?: string;
    sessionId: string;
  };
};

export type ModelRequest = {
  system?: string;
  messages?: ModelMessage[];
  temperature?: number;
  tools?: ModelToolSet;
  toolChoice?: "auto" | "required";
  providerOptions: ModelProviderOptions;
};

export type ModelStream =
  | ModelFullStream
  | ModelTextStream
  | {
      fullStream: ModelFullStream;
    }
  | {
      textStream: ModelTextStream;
    };

export type ModelStreamPart =
  | {
      type: "text-start";
      id: string;
      [key: string]: unknown;
    }
  | {
      type: "text-end";
      id: string;
      [key: string]: unknown;
    }
  | {
      type: "text";
      text: string;
    }
  | {
      type: "text-delta";
      id?: string;
      text?: string;
      textDelta?: string;
      [key: string]: unknown;
    }
  | {
      type: "reasoning-start";
      id: string;
      [key: string]: unknown;
    }
  | {
      type: "reasoning-end";
      id: string;
      [key: string]: unknown;
    }
  | {
      type: "reasoning";
      text: string;
    }
  | {
      type: "reasoning-delta";
      id?: string;
      text?: string;
      textDelta?: string;
      [key: string]: unknown;
    }
  | {
      type: "source";
      sourceType: "url";
      id: string;
      url: string;
      title?: string;
      [key: string]: unknown;
    }
  | {
      type: "source";
      sourceType: "document";
      id: string;
      mediaType: string;
      title?: string;
      filename?: string;
      [key: string]: unknown;
    }
  | {
      type: "file";
      file: unknown;
    }
  | {
      type: "tool-call-streaming-start";
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool-call-delta";
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    }
  | {
      type: "tool-input-start";
      id: string;
      toolName: string;
      [key: string]: unknown;
    }
  | {
      type: "tool-input-end";
      id: string;
      [key: string]: unknown;
    }
  | {
      type: "tool-input-delta";
      id: string;
      delta: string;
      [key: string]: unknown;
    }
  | {
      type: "tool-input-error";
      id?: string;
      error?: unknown;
      [key: string]: unknown;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      input?: unknown;
      output?: unknown;
    }
  | {
      type: "tool-error";
      toolCallId: string;
      toolName: string;
      input?: unknown;
      error: unknown;
      [key: string]: unknown;
    }
  | {
      type: "tool-output-denied";
      toolCallId: string;
      toolName: string;
      [key: string]: unknown;
    }
  | {
      type: "tool-approval-request";
      approvalId: string;
      toolCall: unknown;
      [key: string]: unknown;
    }
  | {
      type: "finish";
      finishReason:
        | "stop"
        | "length"
        | "content-filter"
        | "tool-calls"
        | "error"
        | "other"
        | "unknown";
      totalUsage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        [key: string]: unknown;
      };
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "abort";
      reason?: unknown;
    }
  | {
      type:
        | "start"
        | "stream-start"
        | "response-metadata"
        | "start-step"
        | "finish-step"
        | "reasoning-part-finish"
        | "step-start"
        | "raw";
      [key: string]: unknown;
    };

export type ModelTextStream = ReadableStream<string> | AsyncIterable<string>;

export type ModelTool = {
  type?: "function";
  description?: string;
  inputSchema?: unknown;
};

export type ModelToolSet = Record<string, ModelTool>;

export type ModelUserMessageContent = Array<
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      data: string | Uint8Array | ArrayBuffer | URL;
      mediaType: string;
    }
>;

export type StreamCompletion<TIcon = unknown> = (
  model: RegisteredModel<TIcon>,
  request: ModelRequest,
) => ModelStream | Promise<ModelStream>;
