// @covers AI.ModelStreamPart
// @covers AI.ModelStreamPart.approvalId
// @covers AI.ModelStreamPart.argsTextDelta
// @covers AI.ModelStreamPart.delta
// @covers AI.ModelStreamPart.error
// @covers AI.ModelStreamPart.file
// @covers AI.ModelStreamPart.filename
// @covers AI.ModelStreamPart.finishReason
// @covers AI.ModelStreamPart.id
// @covers AI.ModelStreamPart.input
// @covers AI.ModelStreamPart.mediaType
// @covers AI.ModelStreamPart.output
// @covers AI.ModelStreamPart.reason
// @covers AI.ModelStreamPart.sourceType
// @covers AI.ModelStreamPart.text
// @covers AI.ModelStreamPart.textDelta
// @covers AI.ModelStreamPart.title
// @covers AI.ModelStreamPart.toolCall
// @covers AI.ModelStreamPart.toolCallId
// @covers AI.ModelStreamPart.toolName
// @covers AI.ModelStreamPart.totalUsage
// @covers AI.ModelStreamPart.totalUsage.inputTokens
// @covers AI.ModelStreamPart.totalUsage.outputTokens
// @covers AI.ModelStreamPart.totalUsage.totalTokens
// @covers AI.ModelStreamPart.type
// @covers AI.ModelStreamPart.url
import type { AI } from "../../runtime/src/api/index.ts";
import { expect, test } from "bun:test";
import {
  encodeModelRequest,
  parseHostMessage,
  parseRuntimeMessage,
  type ProviderRequest,
  type ProviderResponse,
} from "./index.ts";

const model = { id: "local", title: "Local" };
const request = encodeModelRequest({
  providerOptions: { raycast: { locale: "en", currentDate: "today", sessionId: "test" } },
});
const hosts: ProviderRequest[] = [
  { type: "provider.getModels", id: "1" },
  { type: "provider.stream", id: "2", model, request },
  { type: "provider.abort", id: "2" },
];
const parts: AI.ModelStreamPart[] = [
  { type: "text-start", id: "1" },
  { type: "text-end", id: "1" },
  { type: "text", text: "answer" },
  { type: "text-delta", textDelta: "answer", text: "answer", id: "1" },
  { type: "reasoning-start", id: "r" },
  { type: "reasoning-end", id: "r" },
  { type: "reasoning", text: "thinking" },
  { type: "reasoning-delta", textDelta: "thought" },
  { type: "source", sourceType: "url", id: "s", url: "https://example.com", title: "Source" },
  {
    type: "source",
    sourceType: "document",
    id: "d",
    mediaType: "text/plain",
    title: "Doc",
    filename: "doc.txt",
  },
  { type: "file", file: { data: "base64" } },
  { type: "tool-call-streaming-start", toolCallId: "c", toolName: "lookup" },
  { type: "tool-call-delta", toolCallId: "c", toolName: "lookup", argsTextDelta: "{}" },
  { type: "tool-input-start", id: "c", toolName: "lookup" },
  { type: "tool-input-end", id: "c" },
  { type: "tool-input-delta", id: "c", delta: "{}" },
  { type: "tool-input-error", id: "c", error: "bad input" },
  { type: "tool-call", toolCallId: "c", toolName: "lookup", input: {} },
  { type: "tool-result", toolCallId: "c", toolName: "lookup", input: {}, output: { ok: true } },
  { type: "tool-error", toolCallId: "c", toolName: "lookup", input: {}, error: "failed" },
  { type: "tool-output-denied", toolCallId: "c", toolName: "lookup" },
  { type: "tool-approval-request", approvalId: "a", toolCall: { id: "c" } },
  {
    type: "finish",
    finishReason: "stop",
    totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
  { type: "error", error: "failed" },
  { type: "abort", reason: "cancelled" },
  ...(
    [
      "start",
      "stream-start",
      "response-metadata",
      "start-step",
      "finish-step",
      "reasoning-part-finish",
      "step-start",
      "raw",
    ] as const
  ).map((type) => ({ type })),
];
const runtimes: ProviderResponse[] = [
  { type: "provider.models", id: "1", models: [model] },
  ...parts.map((part): ProviderResponse => ({ type: "provider.part", id: "2", part })),
  { type: "provider.end", id: "2" },
  { type: "provider.error", id: "2", error: { code: "PROVIDER_ERROR", message: "failed" } },
];

test("every provider message and stream part round-trips through JSON validation", () => {
  for (const message of hosts)
    expect(parseHostMessage(JSON.parse(JSON.stringify(message)))).toEqual({ ok: true, message });
  for (const message of runtimes)
    expect(parseRuntimeMessage(JSON.parse(JSON.stringify(message)))).toEqual({ ok: true, message });
});

test("provider messages reject missing ids, extra envelope fields and malformed payloads", () => {
  for (const message of hosts) {
    expect(parseHostMessage({ ...message, id: undefined }).ok).toBe(false);
    expect(parseHostMessage({ ...message, typo: true }).ok).toBe(false);
  }
  for (const message of runtimes) {
    expect(parseRuntimeMessage({ ...message, id: 1 }).ok).toBe(false);
    expect(parseRuntimeMessage({ ...message, typo: true }).ok).toBe(false);
  }
  for (const payload of [
    { models: [{}] },
    { models: "wrong" },
    { models: [{ ...model, capabilities: { streaming: { supported: "yes" } } }] },
  ])
    expect(parseRuntimeMessage({ type: "provider.models", id: "1", ...payload }).ok).toBe(false);
  for (const part of [
    { type: "unknown" },
    { type: "text", text: 2 },
    { type: "finish", finishReason: "invalid" },
    { type: "source", id: "s", sourceType: "url" },
    { type: "tool-call", toolCallId: "c", toolName: "lookup" },
  ])
    expect(parseRuntimeMessage({ type: "provider.part", id: "2", part }).ok).toBe(false);
  expect(parseHostMessage({ ...hosts[1], request: {} }).ok).toBe(false);
  expect(
    parseHostMessage({
      ...hosts[1],
      request: {
        ...request,
        messages: [
          { role: "user", content: [{ type: "file", data: { kind: "bytes", value: [256] } }] },
        ],
      },
    }).ok,
  ).toBe(false);
  expect(
    parseRuntimeMessage({ type: "provider.error", id: "2", error: { message: "bad" } }).ok,
  ).toBe(false);
});

test("provider requests validate request options and role-specific content", () => {
  for (const changes of [
    { temperature: "warm" },
    { system: 1 },
    { toolChoice: "never" },
    { tools: { lookup: { type: "invalid" } } },
    { providerOptions: { raycast: { locale: 1, currentDate: "today", sessionId: "test" } } },
    { messages: [{ role: "invalid", content: [] }] },
    { messages: [{ role: "system", content: [] }] },
    { messages: [{ role: "user", content: [{ type: "reasoning", text: "private" }] }] },
    { messages: [{ role: "user", content: [{ type: "text", text: 1 }] }] },
    {
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "c", toolName: "lookup" }],
        },
      ],
    },
    {
      messages: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c",
              toolName: "lookup",
              output: { type: "text", value: "wrong" },
            },
          ],
        },
      ],
    },
  ])
    expect(parseHostMessage({ ...hosts[1], request: { ...request, ...changes } }).ok).toBe(false);
});

test("capability progress and cancellation round-trip and reject unknown fields", () => {
  const progress = { type: "capability.progress", id: "ask", value: "chunk" } as const;
  const cancel = { type: "capability.cancel", id: "ask" } as const;
  expect(parseHostMessage(progress)).toEqual({ ok: true, message: progress });
  expect(parseRuntimeMessage(cancel)).toEqual({ ok: true, message: cancel });
  expect(parseHostMessage({ ...progress, extra: true }).ok).toBe(false);
  expect(parseRuntimeMessage({ ...cancel, extra: true }).ok).toBe(false);
  expect(parseHostMessage(cancel).ok).toBe(false);
  expect(parseRuntimeMessage(progress).ok).toBe(false);
  expect(
    parseRuntimeMessage({
      type: "provider.models",
      id: "list",
      models: [{ ...model, extra: true }],
    }).ok,
  ).toBe(false);
});
