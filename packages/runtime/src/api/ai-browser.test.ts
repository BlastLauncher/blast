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
// @covers AI.ask
// @covers AI.AskOptions
// @covers AI.AskOptions.creativity
// @covers AI.AskOptions.model
// @covers AI.AskOptions.signal
// @covers AI.Creativity
// @covers AI.ModelSelector
// @covers AI.ModelSelector.id
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

test("AI propagates denial, rejects malformed host responses", async () => {
  setCapabilityRequester(async () => {
    throw new Error("Capability denied: ai.ask");
  });
  await expect(AI.ask("q")).rejects.toThrow("Capability denied");

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

// @covers AI.refreshModels
test("AI provider selectors receive each chunk once and refresh uses its capability", async () => {
  setCapabilityRequester(async (name, params, options) => {
    if (name === "ai.models.refresh") {
      expect(params).toEqual({});
      return null;
    }
    expect(params.model).toEqual({ id: "local" });
    await Promise.resolve();
    options?.onProgress?.("one");
    options?.onProgress?.("two");
    return "onetwo";
  });
  const chunks: string[] = [];
  const result = AI.ask("q", { model: { id: "local" } });
  result.on("data", (chunk) => chunks.push(chunk));
  expect(await result).toBe("onetwo");
  expect(chunks).toEqual(["one", "two"]);
  await AI.refreshModels();
});

// @covers AI.experimental_decide
test("decide serializes state, narrows choices and validates all answer types", async () => {
  const input = {
    state: { text: "issue" },
    questions: {
      urgent: { type: "noul", instructions: "urgent?" },
      severity: { type: "score", instructions: "severity?", criteria: ["low", "high"] },
      category: {
        type: "choice",
        instructions: "category?",
        criteria: { bug: "defect", other: null },
      },
    },
  } as const;
  const answers = {
    urgent: { type: "noul", noul: 0.8 },
    severity: {
      type: "score",
      score: 0.5,
      confidence: 0.9,
      legend: { 0: "low", 1: "high" },
      probabilities: { 0: 0.5, 1: 0.5 },
    },
    category: { type: "choice", choice: "bug", confidence: 1, probabilities: { bug: 1, other: 0 } },
  };
  setCapabilityRequester(async (name, params) => {
    expect(name).toBe("ai.decide");
    expect(params.state).toBe('{"text":"issue"}');
    return answers;
  });
  const result = await AI.experimental_decide(input);
  const choice: "bug" | "other" = result.category.choice;
  expect(choice).toBe("bug");
  expect(result.urgent.noul).toBe(answers.urgent.noul);
  for (const bad of [
    null,
    {},
    { ...answers, urgent: { type: "noul", noul: 2 } },
    { ...answers, severity: { ...answers.severity, score: 2 } },
    { ...answers, severity: { ...answers.severity, legend: { 0: "wrong", 1: "high" } } },
    { ...answers, category: { ...answers.category, choice: "unknown" } },
    { ...answers, category: { ...answers.category, probabilities: { bug: 0.2, other: 0.1 } } },
    { ...answers, category: { ...answers.category, confidence: -1 } },
  ]) {
    setCapabilityRequester(async () => bad);
    await expect(AI.experimental_decide(input)).rejects.toThrow("invalid answer");
  }
  setCapabilityRequester(async () => {
    throw new Error("Capability denied: ai.decide");
  });
  await expect(AI.experimental_decide(input)).rejects.toThrow("denied");
});

test("decide rejects malformed questions and unserializable state before dispatching", async () => {
  let dispatched = false;
  setCapabilityRequester(async () => {
    dispatched = true;
    return {};
  });
  for (const questions of [
    { q: { type: "score", instructions: "s?", criteria: ["one"] } },
    { q: { type: "score", instructions: "s?", criteria: Array.from({ length: 11 }, String) } },
    { q: { type: "choice", instructions: "c?", criteria: {} } },
    { q: { type: "noul" } },
  ])
    await expect(AI.experimental_decide({ state: "s", questions } as never)).rejects.toThrow(
      "invalid question",
    );
  await expect(
    AI.experimental_decide({
      state: undefined,
      questions: { q: { type: "noul", instructions: "q?" } },
    } as never),
  ).rejects.toThrow("JSON-serializable");
  expect(dispatched).toBe(false);
});

test("decide aborts before dispatch or while waiting, without accepting a late answer", async () => {
  const input = { state: "s", questions: { q: { type: "noul", instructions: "q?" } } } as const;
  const controller = new AbortController();
  let dispatches = 0;
  let answer!: (value: { q: { type: "noul"; noul: number } }) => void;
  setCapabilityRequester(() => {
    dispatches++;
    return new Promise((resolve) => {
      answer = resolve;
    });
  });
  const result = AI.experimental_decide(input, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  answer({ q: { type: "noul", noul: 1 } });
  await expect(AI.experimental_decide(input, { signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(dispatches).toBe(1);
});
