#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCensusReport, scanCorpus } from "@blastlauncher/compatibility";
import { CapabilityBroker, createInMemoryLocalStorageProvider } from "@blastlauncher/capability";
import { BlastCore, relaySessionTraffic } from "@blastlauncher/core";
import { FilesystemExtensionCatalog } from "@blastlauncher/core-node";
import { ExtensionHost } from "@blastlauncher/extension-host";
import { NodeExtensionProcessLauncher } from "@blastlauncher/extension-host-node";
import { SceneStateBuffer } from "@blastlauncher/scene";

const CORPUS_URL = "https://github.com/raycast/extensions";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 8;

// Keep this list in the probe so the report distinguishes static API gaps from
// failures caused by bundling, command execution, or the scene boundary.
const SUPPORTED_API_IMPORTS = new Set([
  "Action",
  "ActionPanel",
  "ActionStyle",
  "Alert",
  "AI",
  "Application",
  "BrowserExtension",
  "Cache",
  "Clipboard",
  "Color",
  "CopyToClipboardAction",
  "OpenAction",
  "PasteAction",
  "ImageMask",
  "PushAction",
  "SubmitFormAction",
  "captureException",
  "clearSearchBar",
  "clearLocalStorage",
  "copyTextToClipboard",
  "Detail",
  "Environment",
  "Form",
  "FormValue",
  "FormValues",
  "FileIcon",
  "FileSystemItem",
  "Grid",
  "Icon",
  "Image",
  "ImageLike",
  "Keyboard",
  "KeyEquivalent",
  "KeyboardShortcut",
  "LaunchType",
  "LaunchProps",
  "List",
  "LocalStorage",
  "MenuBarExtra",
  "Navigation",
  "OAuth",
  "PopToRootType",
  "PreferenceValues",
  "Preference",
  "Preferences",
  "preferences",
  "Toast",
  "ToastStyle",
  "Tool",
  "closeMainWindow",
  "confirmAlert",
  "environment",
  "getDefaultApplication",
  "getLocalStorageItem",
  "getPreferenceValues",
  "getApplications",
  "getFrontmostApplication",
  "getSelectedFinderItems",
  "getSelectedText",
  "open",
  "OpenInBrowserAction",
  "openCommandPreferences",
  "openExtensionPreferences",
  "popToRoot",
  "pasteText",
  "removeLocalStorageItem",
  "randomId",
  "launchCommand",
  "showHUD",
  "showInFinder",
  "showToast",
  "setLocalStorageItem",
  "trash",
  "updateCommandMetadata",
  "useNavigation",
  "WindowManagement",
]);

const args = process.argv.slice(2);
if (args.length !== 3 || args.includes("--help")) {
  console.error("Usage: node packages/blast-e2e/scripts/probe-corpus.mjs <corpus-root> <revision> <output-json>");
  process.exit(args.includes("--help") ? 0 : 2);
}

const corpusRoot = path.resolve(args[0]);
const corpusRevision = args[1];
const outputPath = path.resolve(args[2]);
const timeoutMilliseconds = parsePositiveInteger(process.env.BLAST_CORPUS_PROBE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
const concurrency = parsePositiveInteger(process.env.BLAST_CORPUS_PROBE_CONCURRENCY, DEFAULT_CONCURRENCY);
const bootstrapPath = fileURLToPath(new URL("../test/fixtures/bootstrap.mjs", import.meta.url));
const catalog = new FilesystemExtensionCatalog({ root: corpusRoot });

const scans = await scanCorpus(corpusRoot);
const census = buildCensusReport(scans, { corpusRevision, corpusUrl: CORPUS_URL });
const selections = scans.map(selectCommand);
const results = new Array(scans.length);
let nextIndex = 0;

await Promise.all(
  Array.from({ length: Math.min(concurrency, scans.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= scans.length) {
        return;
      }
      results[index] = await probeExtension(scans[index], selections[index]);
      if ((index + 1) % 25 === 0 || index + 1 === scans.length) {
        console.error(`probed ${index + 1}/${scans.length}`);
      }
    }
  }),
);

const report = {
  schemaVersion: 1,
  protocolVersion: census.protocolVersion,
  corpus: {
    revision: corpusRevision,
    url: CORPUS_URL,
    rootSelection: "immediate subdirectories containing package.json",
    extensions: scans.length,
    sourceFiles: scans.reduce((total, scan) => total + scan.sourceFiles, 0),
  },
  selection: {
    strategy:
      "Use the first manifest command with mode=view; fall back to an unset-mode command, then a menu-bar command. An extension with only no-view commands is not renderable by the scene probe.",
    renderableExtensions: selections.filter((selection) => selection.renderable).length,
    nonRenderableExtensions: selections.filter((selection) => !selection.renderable).length,
    timeoutMilliseconds,
    concurrency,
  },
  adapter: {
    supportedApiImports: [...SUPPORTED_API_IMPORTS].toSorted(),
  },
  census,
  outcomes: countBy(results, (result) => result.outcome),
  coverage: buildCoverage(results, selections),
  staticBlockers: buildStaticBlockers(results),
  failureClasses: buildFailureClasses(results),
  failureSamples: buildFailureSamples(results),
  results,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

async function probeExtension(scan, selection) {
  const extensionId = scan.manifest?.name;
  const resultBase = {
    directory: path.basename(scan.directory),
    extensionId: extensionId ?? null,
    commandName: selection.command?.name ?? null,
    mode: selection.command?.mode ?? null,
    staticUnsupportedApis: scan.apiImports
      .map(({ api }) => api)
      .filter((api) => !SUPPORTED_API_IMPORTS.has(api))
      .toSorted(),
  };

  if (extensionId === undefined || selection.command === undefined) {
    return { ...resultBase, outcome: "invalid-manifest" };
  }
  if (!selection.renderable) {
    return { ...resultBase, outcome: "not-renderable" };
  }

  const identity = { extensionId, commandName: selection.command.name };
  const stderr = [];
  const { core, broker } = createCore(stderr);
  const buffer = new SceneStateBuffer();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("probe timeout"), timeoutMilliseconds);
  timeout.unref();
  let session;
  let relay;
  let relayFailure;
  let relayFinished = false;

  try {
    session = await core.runCommand(identity, controller.signal);
    relay = relaySessionTraffic(session, {
      sceneSink: {
        publish(transaction) {
          buffer.apply(transaction);
        },
      },
      capabilityBroker: broker,
    });
    void relay.done.then(
      () => {
        relayFinished = true;
      },
      (error) => {
        relayFailure = error;
        relayFinished = true;
      },
    );

    const scenePublished = await waitForScene(
      buffer,
      session.process.completion,
      () => relayFailure,
      () => relayFinished,
    );
    if (!scenePublished) {
      await relay.done.catch(() => {});
      return classifyFailure(resultBase, undefined, stderr, session);
    }

    await core.stopCommand(identity, "corpus compatibility probe complete");
    await relay.done;
    return { ...resultBase, outcome: "renders" };
  } catch (error) {
    await relay?.done.catch(() => {});
    return classifyFailure(resultBase, error, stderr, session);
  } finally {
    clearTimeout(timeout);
    controller.abort("probe complete");
    await core.close("corpus compatibility probe complete");
  }
}

function createCore(stderr) {
  let hostMessageId = 0;
  let sessionId = 0;
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath,
    environment: process.env,
    onStderr(_descriptor, chunk) {
      stderr.push(chunk);
    },
  });
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "corpus-probe-host", version: "0.0.0" },
    createMessageId: () => `probe-host-${++hostMessageId}`,
    createSessionId: () => `probe-session-${++sessionId}`,
  });
  // The probe host is a deliberately permissive in-memory client for the
  // already measured capabilities. Production clients still use explicit
  // extension grants and deny-by-default providers.
  const allowedCapabilities = new Set([
    "alert.confirm",
    "ai.ask",
    "application.default",
    "application.frontmost",
    "application.list",
    "browser-extension.getContent",
    "browser-extension.getTabs",
    "clipboard.read",
    "clipboard.write",
    "command.launch",
    "command.updateMetadata",
    "hud.show",
    "local-storage.clear",
    "local-storage.get",
    "local-storage.remove",
    "local-storage.set",
    "navigation.clearSearchBar",
    "navigation.popToRoot",
    "open.open",
    "preferences.openExtension",
    "preferences.openCommand",
    "selection.read",
    "finder.selectedItems",
    "finder.show",
    "filesystem.trash",
    "oauth.authorizationRequest",
    "oauth.authorize",
    "oauth.getTokens",
    "oauth.removeTokens",
    "oauth.setTokens",
    "telemetry.captureException",
    "window.close",
    "window-management.getActiveWindow",
    "window-management.getDesktops",
    "window-management.getWindowsOnActiveDesktop",
    "window-management.setWindowBounds",
  ]);
  const broker = new CapabilityBroker({
    policy: {
      decide(request) {
        return allowedCapabilities.has(`${request.capability}.${request.operation}`) ? "allow" : "deny";
      },
    },
    providers: {
      alert: {
        async perform(request) {
          if (request.operation === "confirm") {
            return true;
          }
          throw new Error(`Unknown alert operation ${JSON.stringify(request.operation)}`);
        },
      },
      application: {
        async perform(request) {
          if (request.operation === "list") {
            return JSON.stringify([
              {
                name: "Raycast",
                localizedName: "Raycast",
                path: "/Applications/Raycast.app",
                bundleId: "com.raycast.macos",
              },
              {
                name: "Terminal",
                localizedName: "Terminal",
                path: "/System/Applications/Utilities/Terminal.app",
                bundleId: "com.apple.Terminal",
              },
            ]);
          }
          if (request.operation === "frontmost") {
            return JSON.stringify({
              name: "Terminal",
              localizedName: "Terminal",
              path: "/System/Applications/Utilities/Terminal.app",
              bundleId: "com.apple.Terminal",
            });
          }
          if (request.operation === "default") {
            return JSON.stringify({
              name: "TextEdit",
              localizedName: "TextEdit",
              path: "/System/Applications/TextEdit.app",
              bundleId: "com.apple.TextEdit",
            });
          }
          throw new Error(`Unknown application operation ${JSON.stringify(request.operation)}`);
        },
      },
      "browser-extension": {
        async perform(request) {
          if (request.operation === "getTabs") {
            return JSON.stringify([{ id: 1, url: "https://example.com", title: "Example", active: true }]);
          }
          if (request.operation === "getContent") {
            return "Fixture browser content";
          }
          throw new Error(`Unknown browser-extension operation ${JSON.stringify(request.operation)}`);
        },
      },
      clipboard: {
        async perform(request) {
          if (request.operation === "read") {
            return "";
          }
          if (request.operation === "write") {
            return undefined;
          }
          if (request.operation === "paste") {
            return undefined;
          }
          throw new Error(`Unknown clipboard operation ${JSON.stringify(request.operation)}`);
        },
      },
      command: {
        async perform(request) {
          if (request.operation === "launch" || request.operation === "updateMetadata") {
            return undefined;
          }
          throw new Error(`Unknown command operation ${JSON.stringify(request.operation)}`);
        },
      },
      ai: {
        async perform(request) {
          if (request.operation === "ask") {
            return "probe answer";
          }
          throw new Error(`Unknown AI operation ${JSON.stringify(request.operation)}`);
        },
      },
      hud: {
        async perform(request) {
          if (request.operation === "show") {
            return undefined;
          }
          throw new Error(`Unknown HUD operation ${JSON.stringify(request.operation)}`);
        },
      },
      "local-storage": createInMemoryLocalStorageProvider(),
      finder: {
        async perform(request) {
          if (request.operation === "selectedItems") {
            return JSON.stringify([{ path: "/tmp/example.txt" }, { path: "/tmp/second-example.txt" }]);
          }
          if (request.operation === "show") {
            return undefined;
          }
          throw new Error(`Unknown Finder operation ${JSON.stringify(request.operation)}`);
        },
      },
      filesystem: {
        async perform(request) {
          if (request.operation === "trash") {
            return undefined;
          }
          throw new Error(`Unknown filesystem operation ${JSON.stringify(request.operation)}`);
        },
      },
      navigation: {
        async perform(request) {
          if (request.operation === "popToRoot" || request.operation === "clearSearchBar") {
            return undefined;
          }
          throw new Error(`Unknown navigation operation ${JSON.stringify(request.operation)}`);
        },
      },
      oauth: {
        async perform(request) {
          if (request.operation === "authorizationRequest") {
            return JSON.stringify({
              clientId: request.arguments.clientId,
              codeChallenge: "probe-code-challenge",
              codeVerifier: "probe-code-verifier",
              state: "probe-state",
              redirectURI: "https://raycast.com/redirect?packageName=probe",
            });
          }
          if (request.operation === "authorize") {
            return JSON.stringify({ authorizationCode: "probe-authorization-code" });
          }
          if (
            request.operation === "getTokens" ||
            request.operation === "removeTokens" ||
            request.operation === "setTokens"
          ) {
            return undefined;
          }
          throw new Error(`Unknown OAuth operation ${JSON.stringify(request.operation)}`);
        },
      },
      open: {
        async perform(request) {
          if (request.operation === "open") {
            return undefined;
          }
          throw new Error(`Unknown open operation ${JSON.stringify(request.operation)}`);
        },
      },
      preferences: {
        async perform(request) {
          if (request.operation === "openExtension" || request.operation === "openCommand") {
            return undefined;
          }
          throw new Error(`Unknown preferences operation ${JSON.stringify(request.operation)}`);
        },
      },
      telemetry: {
        async perform(request) {
          if (request.operation === "captureException") {
            return undefined;
          }
          throw new Error(`Unknown telemetry operation ${JSON.stringify(request.operation)}`);
        },
      },
      selection: {
        async perform(request) {
          if (request.operation === "read") {
            return "selected text";
          }
          throw new Error(`Unknown selection operation ${JSON.stringify(request.operation)}`);
        },
      },
      window: {
        async perform(request) {
          if (request.operation === "close") {
            return undefined;
          }
          throw new Error(`Unknown window operation ${JSON.stringify(request.operation)}`);
        },
      },
      "window-management": {
        async perform(request) {
          if (request.operation === "getActiveWindow") {
            return JSON.stringify(createProbeWindow(true));
          }
          if (request.operation === "getWindowsOnActiveDesktop") {
            return JSON.stringify([createProbeWindow(true), createProbeWindow(false)]);
          }
          if (request.operation === "getDesktops") {
            return JSON.stringify([
              {
                size: { width: 1920, height: 1080 },
                id: "desktop-1",
                screenId: "screen-1",
                active: true,
                type: "User",
              },
            ]);
          }
          if (request.operation === "setWindowBounds") {
            return undefined;
          }
          throw new Error(`Unknown window-management operation ${JSON.stringify(request.operation)}`);
        },
      },
    },
  });
  return { core: new BlastCore({ catalog, extensionHost: host }), broker };
}

function createProbeWindow(active) {
  return {
    id: active ? "window-1" : "window-2",
    application: {
      name: active ? "Terminal" : "Raycast",
      localizedName: active ? "Terminal" : "Raycast",
      path: active ? "/System/Applications/Utilities/Terminal.app" : "/Applications/Raycast.app",
      bundleId: active ? "com.apple.Terminal" : "com.raycast.macos",
    },
    bounds: {
      position: { x: active ? 0 : 960, y: 0 },
      size: { width: 960, height: 1080 },
    },
    desktopId: "desktop-1",
    fullScreenSettable: true,
    resizable: true,
    positionable: true,
    active,
  };
}

async function waitForScene(buffer, completion, getRelayFailure, isRelayFinished) {
  let processFinished = false;
  void completion.then(
    () => {
      processFinished = true;
    },
    () => {
      processFinished = true;
    },
  );
  while (buffer.rootId === undefined) {
    const relayFailure = getRelayFailure();
    if (relayFailure !== undefined) {
      throw relayFailure;
    }
    if (processFinished || isRelayFinished()) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

function classifyFailure(resultBase, error, stderr, session) {
  const diagnostic = normalizeDiagnostic(
    [error instanceof Error ? (error.stack ?? error.message) : error, ...stderr].filter(Boolean).join("\n"),
  );
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : undefined;
  const lower = diagnostic.toLowerCase();

  if (code === "catalog_entrypoint_missing") {
    return { ...resultBase, outcome: "no-entrypoint", failureCode: code };
  }
  if (lower.includes("probe timeout") || lower.includes("aborted")) {
    return { ...resultBase, outcome: "timeout", failureCode: "probe_timeout" };
  }
  if (
    lower.includes("compatibilityerror") ||
    lower.includes("unsupported_api") ||
    lower.includes("not supported by the blast compatibility surface")
  ) {
    return { ...resultBase, outcome: "structured-compatibility-error", failureCode: "unsupported_api" };
  }
  if (
    lower.includes("could not resolve") ||
    lower.includes("could not find") ||
    lower.includes("cannot find module") ||
    lower.includes("module not found") ||
    lower.includes("failed to resolve")
  ) {
    return { ...resultBase, outcome: "third-party-dependency", failureCode: "dependency_unavailable" };
  }
  if (session !== undefined) {
    return { ...resultBase, outcome: "process-failure", failureCode: code ?? "process_failed" };
  }
  return { ...resultBase, outcome: "process-failure", failureCode: code ?? "startup_failed" };
}

function selectCommand(scan) {
  const commands = scan.manifest?.commands ?? [];
  const command =
    commands.find((candidate) => candidate.mode === "view") ??
    commands.find((candidate) => candidate.mode === undefined) ??
    commands.find((candidate) => candidate.mode === "menu-bar") ??
    commands[0];
  return {
    command,
    renderable:
      command !== undefined && (command.mode === "view" || command.mode === undefined || command.mode === "menu-bar"),
  };
}

function buildCoverage(results, selections) {
  const renderable = selections.filter((selection) => selection.renderable).length;
  const renders = results.filter((result) => result.outcome === "renders").length;
  return {
    extensionPasses: renders,
    extensionTotal: results.length,
    extensionPassRate: ratio(renders, results.length),
    renderableCommandPasses: renders,
    renderableCommandTotal: renderable,
    renderableCommandPassRate: ratio(renders, renderable),
  };
}

function buildStaticBlockers(results) {
  const counts = new Map();
  for (const result of results) {
    if (result.outcome === "renders") {
      continue;
    }
    for (const api of result.staticUnsupportedApis) {
      counts.set(api, (counts.get(api) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([api, extensionCount]) => ({ api, extensionCount }))
    .toSorted((left, right) => right.extensionCount - left.extensionCount || left.api.localeCompare(right.api));
}

function buildFailureClasses(results) {
  return countBy(
    results.filter((result) => result.outcome !== "renders" && result.outcome !== "not-renderable"),
    (result) => result.outcome,
  );
}

function buildFailureSamples(results) {
  const samples = new Map();
  for (const result of results) {
    if (result.outcome === "renders" || result.outcome === "not-renderable") {
      continue;
    }
    const sample = samples.get(result.outcome) ?? [];
    if (sample.length < 5) {
      sample.push(result.directory);
      samples.set(result.outcome, sample);
    }
  }
  return Object.fromEntries([...samples.entries()].toSorted(([left], [right]) => left.localeCompare(right)));
}

function countBy(values, keyFor) {
  const counts = new Map();
  for (const value of values) {
    const key = keyFor(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)));
}

function normalizeDiagnostic(value) {
  return value
    .replaceAll(/\/tmp\/blast-extension-bundles-[^/\s]+/g, "<bundle-cache>")
    .replaceAll(/\/tmp\/blast-raycast-[^/\s]+/g, "<corpus>")
    .replaceAll(/\b(?:probe-host|probe-session)-\d+\b/g, "<id>");
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
