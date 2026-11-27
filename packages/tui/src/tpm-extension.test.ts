import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openExtension, type ExtensionHandle } from "@blastlauncher/host";
import type { JsonValue, SceneNode } from "@blastlauncher/protocol";
import { waitSceneMatch } from "./test-support.ts";
import { detectTpmPluginsDir } from "./tpm.ts";

const extensionDir = resolve(import.meta.dir, "../extensions/tpm");

type Opened = Awaited<ReturnType<ExtensionHandle["launch"]>>;

function nodes(node: SceneNode | null | undefined): SceneNode[] {
  return node ? [node, ...node.children.flatMap((child) => nodes(child))] : [];
}

function find(node: SceneNode | null | undefined, type: string): SceneNode | undefined {
  return nodes(node).find((candidate) => candidate.type === type);
}

function sceneMatching<T>(
  opened: Opened,
  pick: (root: SceneNode | null | undefined) => T | undefined,
  what: string,
): Promise<T> {
  return waitSceneMatch(opened.session, (scene) => pick(scene.root), what, 10_000);
}

function fire(opened: Opened, node: SceneNode, prop: string, args: JsonValue[] = []) {
  const handler = node.props[prop] as { $handler: string } | undefined;
  if (!handler) throw new Error(`${node.type} has no ${prop}`);
  opened.session.sendEvent(node.id, handler.$handler, args);
}

async function answer(opened: Opened, confirm: boolean) {
  const alert = await sceneMatching(opened, (root) => find(root, "Alert"), "Alert");
  const name = confirm ? "primaryAction" : "dismissAction";
  const action = alert.children.find((child) => child.props.name === name);
  if (!action) throw new Error(`Alert has no ${name}`);
  fire(opened, action, "onAction");
}

function initGitRepo(dir: string) {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "# plugin\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
}

function createFakeTpm() {
  const root = mkdtempSync(join(tmpdir(), "blast-tpm-test-"));
  const pluginsDir = join(root, "plugins");
  const tpmDir = join(pluginsDir, "tpm");
  const binDir = join(tpmDir, "bin");
  const logFile = join(root, "calls.log");
  initGitRepo(tpmDir);
  mkdirSync(binDir, { recursive: true });

  const writeScript = (name: string, body: string) => {
    const file = join(binDir, name);
    writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
    chmodSync(file, 0o755);
  };

  writeScript(
    "install_plugins",
    `printf 'install:%s\\n' "$TMUX_PLUGIN_MANAGER_PATH" >> '${logFile}'\nprintf '\\033[32mInstalled 1 plugin\\033[0m\\n'`,
  );
  writeScript(
    "update_plugins",
    `printf 'update:%s:%s\\n' "$TMUX_PLUGIN_MANAGER_PATH" "$*" >> '${logFile}'\nprintf 'Updating "%s" ... ok\\n' "$*"`,
  );
  writeScript(
    "clean_plugins",
    `printf 'clean:%s\\n' "$TMUX_PLUGIN_MANAGER_PATH" >> '${logFile}'\nprintf 'Cleaned unused plugins\\n'`,
  );

  const samplePlugin = join(pluginsDir, "tmux-blast");
  initGitRepo(samplePlugin);
  const lockFile = join(tpmDir, ".git", "index.lock");
  writeFileSync(lockFile, "");

  return {
    root,
    pluginsDir,
    logFile,
    lockFile,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function calls(logFile: string): string[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
}

describe("detectTpmPluginsDir", () => {
  test("detects TPM from BLAST_TPM_PATH, TMUX_PLUGIN_MANAGER_PATH, XDG, and ~/.tmux/plugins", () => {
    const base = mkdtempSync(join(tmpdir(), "blast-tpm-detect-"));
    try {
      const home = join(base, "home");
      const emptyHome = join(base, "empty");
      mkdirSync(emptyHome, { recursive: true });
      expect(detectTpmPluginsDir({}, emptyHome)).toBeUndefined();

      const defaultPlugins = join(home, ".tmux", "plugins");
      mkdirSync(join(defaultPlugins, "tpm", "bin"), { recursive: true });
      writeFileSync(join(defaultPlugins, "tpm", "bin", "install_plugins"), "#!/bin/sh\n");
      expect(detectTpmPluginsDir({}, home)).toBe(defaultPlugins);

      const xdgConfig = join(base, "xdg");
      const xdgPlugins = join(xdgConfig, "tmux", "plugins");
      mkdirSync(join(xdgPlugins, "tpm"), { recursive: true });
      writeFileSync(join(xdgPlugins, "tpm", "tpm"), "#!/bin/sh\n");
      expect(detectTpmPluginsDir({ XDG_CONFIG_HOME: xdgConfig }, home)).toBe(xdgPlugins);

      const customEnv = join(base, "custom-env");
      mkdirSync(join(customEnv, "tpm"), { recursive: true });
      writeFileSync(join(customEnv, "tpm", "tpm"), "#!/bin/sh\n");
      expect(
        detectTpmPluginsDir(
          { XDG_CONFIG_HOME: xdgConfig, TMUX_PLUGIN_MANAGER_PATH: customEnv },
          home,
        ),
      ).toBe(customEnv);

      const override = join(base, "override");
      mkdirSync(join(override, "tpm"), { recursive: true });
      writeFileSync(join(override, "tpm", "tpm"), "#!/bin/sh\n");
      expect(
        detectTpmPluginsDir(
          { BLAST_TPM_PATH: override, TMUX_PLUGIN_MANAGER_PATH: customEnv },
          home,
        ),
      ).toBe(override);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("tpm extension", () => {
  test("install-plugins and update-plugins run TPM scripts and exit cleanly", async () => {
    const fake = createFakeTpm();
    const extension = openExtension({
      extensionDir,
      inheritEnv: { BLAST_TPM_PATH: fake.pluginsDir },
    });
    try {
      const install = await extension.launch("install-plugins");
      try {
        const exit = await install.session.exited;
        expect(exit.code).toBe(0);
      } finally {
        await install.close();
      }

      const update = await extension.launch("update-plugins");
      try {
        const exit = await update.session.exited;
        expect(exit.code).toBe(0);
      } finally {
        await update.close();
      }

      expect(calls(fake.logFile)).toEqual([
        `install:${fake.pluginsDir}/`,
        `update:${fake.pluginsDir}/:all`,
      ]);
    } finally {
      await extension.close();
      fake.cleanup();
    }
  }, 20_000);

  test("clean-plugins confirms destructively before running clean_plugins", async () => {
    const fake = createFakeTpm();
    const extension = openExtension({
      extensionDir,
      inheritEnv: { BLAST_TPM_PATH: fake.pluginsDir },
    });
    try {
      const opened = await extension.launch("clean-plugins");
      try {
        const alert = await sceneMatching(opened, (root) => find(root, "Alert"), "clean confirm");
        expect(alert.props.title).toBe("Clean unused TPM plugins?");
        expect(calls(fake.logFile)).toEqual([]);
        await answer(opened, true);
        const exit = await opened.session.exited;
        expect(exit.code).toBe(0);
      } finally {
        await opened.close();
      }

      expect(calls(fake.logFile)).toEqual([`clean:${fake.pluginsDir}/`]);
    } finally {
      await extension.close();
      fake.cleanup();
    }
  }, 20_000);

  test("manage-plugins lists installed plugins, removes stale index.lock, and updates a single plugin", async () => {
    const fake = createFakeTpm();
    const extension = openExtension({
      extensionDir,
      inheritEnv: { BLAST_TPM_PATH: fake.pluginsDir },
    });
    try {
      const opened = await extension.launch("manage-plugins");
      try {
        const items = await sceneMatching(
          opened,
          (root) => {
            const list = find(root, "List");
            if (!list || list.props.isLoading) return undefined;
            const found = nodes(list).filter((n) => n.type === "List.Item");
            return found.length >= 2 ? found : undefined;
          },
          "installed TPM plugins",
        );
        const titles = items.map((item) => String(item.props.title));
        expect(titles).toEqual(["tmux-blast", "tpm"]);

        const tpmItem = items.find((item) => item.props.title === "tpm")!;
        expect(String(tpmItem.props.subtitle)).toMatch(/^main · [0-9a-f]+$/);
        const removeLockAction = nodes(tpmItem).find(
          (n) => n.type === "Action" && n.props.title === "Remove Stale Git Lock",
        );
        expect(removeLockAction).toBeDefined();
        expect(existsSync(fake.lockFile)).toBe(true);

        fire(opened, removeLockAction!, "onAction");
        await sceneMatching(
          opened,
          (root) => {
            const refreshed = nodes(root).find(
              (n) => n.type === "List.Item" && n.props.title === "tpm",
            );
            if (!refreshed) return undefined;
            const stillLocked = nodes(refreshed).some(
              (n) => n.type === "Action" && n.props.title === "Remove Stale Git Lock",
            );
            return stillLocked ? undefined : true;
          },
          "stale lock removal refresh",
        );
        expect(existsSync(fake.lockFile)).toBe(false);

        const blastItem = nodes(opened.session.latestScene?.root).find(
          (n) => n.type === "List.Item" && n.props.title === "tmux-blast",
        )!;
        const updateAction = nodes(blastItem).find(
          (n) => n.type === "Action" && n.props.title === "Update tmux-blast",
        );
        expect(updateAction).toBeDefined();
        fire(opened, updateAction!, "onAction");
        await sceneMatching(
          opened,
          (root) => {
            const toast = find(root, "Toast");
            return toast?.props.title === "Update tmux-blast" &&
              String(toast.props.style).toLowerCase() === "success"
              ? true
              : undefined;
          },
          "single plugin update success toast",
        );
        expect(calls(fake.logFile)).toEqual([`update:${fake.pluginsDir}/:tmux-blast`]);
      } finally {
        await opened.close();
      }
    } finally {
      await extension.close();
      fake.cleanup();
    }
  }, 20_000);
});
