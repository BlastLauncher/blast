import { afterEach, expect, test } from "bun:test";
import {
  AI,
  BrowserExtension,
  Tool,
  unstable_AI,
  useUnstableAI,
  type AskOptions,
  type Creativity,
  type ModelSelector,
  type BrowserTab,
  type ToolConfirmation,
} from "./index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { environment, setEnvironment } from "./environment.ts";

afterEach(() => {
  setCapabilityRequester(undefined);
  setEnvironment(
    {
      extensionName: "",
      commandName: "",
      ownerOrAuthorName: "",
      assetsPath: "",
      supportPath: "",
      isDevelopment: false,
      appearance: "dark",
      textSize: "medium",
    },
    { name: "", mode: "view" },
  );
});

// @covers AI
// @covers AI.ask partial
// @covers AI.AskOptions
// @covers AI.AskOptions.creativity
// @covers AI.AskOptions.model partial
// @covers AI.AskOptions.signal
// @covers AI.Creativity
// @covers AI.ModelSelector partial
// @covers AI.ModelSelector.id partial
// @covers unstable_AI
// @covers useUnstableAI
test("AI resolves full text, emits one chunk before resolution, and passes typed options", async () => {
  const model: ModelSelector = AI.Model["OpenAI_GPT-6_Luna"];
  const creativity: Creativity = 3;
  const options: AskOptions = { model, creativity };
  setCapabilityRequester(async (name, params) => {
    expect(name).toBe("ai.ask");
    expect(params).toEqual({ prompt: "question", model, creativity: 2 });
    return "answer";
  });
  const chunks: string[] = [];
  const stream = AI.ask("question", options);
  expect(stream).toBeInstanceOf(Promise);
  stream.on("data", (chunk) => chunks.push(chunk));
  expect(await stream).toBe("answer");
  expect(chunks).toEqual(["answer"]);
  expect(await unstable_AI.ask("question", options)).toBe("answer");
  expect(useUnstableAI()).toBeUndefined();
});

test("AI aborts before dispatch or while waiting and suppresses late data", async () => {
  const before = new AbortController();
  before.abort();
  setCapabilityRequester(() => {
    throw new Error("must not dispatch");
  });
  await expect(AI.ask("q", { signal: before.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  let answer!: (value: string) => void;
  setCapabilityRequester(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const controller = new AbortController();
  const stream = AI.ask("q", { signal: controller.signal });
  const chunks: string[] = [];
  stream.on("data", (text) => chunks.push(text));
  controller.abort();
  answer("late");
  await expect(stream).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  expect(chunks).toEqual([]);
});

test("AI propagates denial, rejects provider selectors and malformed host responses", async () => {
  setCapabilityRequester(async () => {
    throw new Error("Capability denied: ai.ask");
  });
  await expect(AI.ask("q")).rejects.toThrow("Capability denied");
  await expect(AI.ask("q", { model: { id: "local" } })).rejects.toThrow(
    "model providers are not supported yet",
  );
  setCapabilityRequester(async () => null);
  await expect(AI.ask("q")).rejects.toThrow("expected a text answer");
});

// @covers BrowserExtension
// @covers BrowserExtension.getTabs
// @covers BrowserExtension.getContent partial
// @covers BrowserExtension.Tab
// @covers BrowserExtension.Tab.id
// @covers BrowserExtension.Tab.url
// @covers BrowserExtension.Tab.title
// @covers BrowserExtension.Tab.favicon
// @covers BrowserExtension.Tab.active
test("browser tabs and content use capabilities and preserve all options", async () => {
  const tab: BrowserTab = {
    id: 7,
    url: "https://example.com",
    title: "Example",
    favicon: "https://example.com/icon",
    active: true,
  };
  setCapabilityRequester(async (name, params) => {
    if (name === "browser.tabs") {
      expect(params).toEqual({});
      return [tab];
    }
    expect(name).toBe("browser.content");
    expect(params).toEqual({ tabId: 7, cssSelector: "main", format: "text" });
    return "content";
  });
  expect(await BrowserExtension.getTabs()).toEqual([tab]);
  expect(await BrowserExtension.getContent({ tabId: 7, cssSelector: "main", format: "text" })).toBe(
    "content",
  );
  await expect(
    BrowserExtension.getContent({ cssSelector: "main", format: "markdown" }),
  ).rejects.toThrow("cannot be used");
  setCapabilityRequester(async () => {
    throw new Error("Capability denied");
  });
  await expect(BrowserExtension.getTabs()).rejects.toThrow("denied");
  await expect(BrowserExtension.getContent()).rejects.toThrow("denied");
  setCapabilityRequester(async () => null);
  await expect(BrowserExtension.getTabs()).rejects.toThrow("invalid tabs");
  await expect(BrowserExtension.getContent()).rejects.toThrow("expected text");
});

test("canAccess reflects the current host grants including aliases", () => {
  for (const availableAPIs of [[], ["AI"], ["BrowserExtension"]] as const) {
    setEnvironment(
      {
        extensionName: "",
        commandName: "",
        ownerOrAuthorName: "",
        assetsPath: "",
        supportPath: "",
        isDevelopment: false,
        appearance: "dark",
        textSize: "medium",
        availableAPIs: [...availableAPIs],
      },
      { name: "test", mode: "view" },
    );
    expect(environment.canAccess(AI)).toBe(availableAPIs.some((api) => api === "AI"));
    expect(environment.canAccess(unstable_AI)).toBe(environment.canAccess(AI));
    expect(environment.canAccess(BrowserExtension)).toBe(
      availableAPIs.some((api) => api === "BrowserExtension"),
    );
  }
});

const confirmation: ToolConfirmation<string> = async (input) =>
  input
    ? {
        style: "destructive",
        message: "Delete?",
        info: [{ name: "Path", value: input }, { name: "Absent" }],
        image: { fileIcon: input },
      }
    : undefined;

// @covers Tool
// @covers Tool.Confirmation
test("Tool confirmation describes typed side effects or skips confirmation", async () => {
  expect(await confirmation("/tmp/file")).toEqual({
    style: "destructive",
    message: "Delete?",
    info: [{ name: "Path", value: "/tmp/file" }, { name: "Absent" }],
    image: { fileIcon: "/tmp/file" },
  });
  expect(await confirmation("")).toBeUndefined();
  expect(Object.keys(Tool)).toEqual([]);
});
