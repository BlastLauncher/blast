import { expect, test } from "bun:test";
import {
  assertTagAvailable,
  assertPublishToken,
  buildPublishPlan,
  orderByDependencies,
  tagForVersion,
  validatePrereleaseVersion,
  type ReleasePackage,
} from "./prerelease.ts";

const source: ReleasePackage[] = [
  {
    id: "serve",
    name: "@blastlauncher/serve",
    dependencies: {
      "@blastlauncher/host": "workspace:*",
      "@blastlauncher/shared-deps": "workspace:*",
    },
  },
  {
    id: "host",
    name: "@blastlauncher/engine",
    dependencies: { "@blastlauncher/runtime": "workspace:*" },
  },
  {
    id: "runtime",
    name: "@blastlauncher/runtime",
    dependencies: { "@blastlauncher/protocol": "workspace:*" },
  },
  { id: "protocol", name: "@blastlauncher/protocol" },
  { id: "shared", name: "@blastlauncher/shared-deps" },
];

test("v3 prerelease versions accept alpha, beta and rc and reject stable or other majors", () => {
  expect(validatePrereleaseVersion("3.0.0-alpha.1")).toBe("3.0.0-alpha.1");
  expect(validatePrereleaseVersion("3.2.4-beta.2")).toBe("3.2.4-beta.2");
  expect(validatePrereleaseVersion("3.9.1-rc.10")).toBe("3.9.1-rc.10");
  expect(validatePrereleaseVersion("3.0.0-alpha.1+build.5")).toBe("3.0.0-alpha.1+build.5");
  for (const version of [
    "3.0.0",
    "2.0.0-alpha.1",
    "3.0.0-dev.1",
    "3.0.0-alpha",
    "3.0.0-alpha.01",
    "03.0.0-alpha.1",
    "v3.0.0-alpha.1",
  ])
    expect(() => validatePrereleaseVersion(version)).toThrow();
  expect(tagForVersion("3.0.0-alpha.1")).toBe("v3.0.0-alpha.1");
});

test("release packages are ordered after their internal dependencies", () => {
  expect(orderByDependencies(source).map((pkg) => pkg.name)).toEqual([
    "@blastlauncher/protocol",
    "@blastlauncher/runtime",
    "@blastlauncher/engine",
    "@blastlauncher/shared-deps",
    "@blastlauncher/serve",
  ]);
});

test("publish planning skips versions already on npm and keeps dependency order", async () => {
  const lookedUp: string[] = [];
  const plan = await buildPublishPlan("3.0.0-alpha.1", source, async (name, version) => {
    lookedUp.push(`${name}@${version}`);
    return name === "@blastlauncher/protocol";
  });
  expect(plan.map((entry) => [entry.name, entry.alreadyPublished])).toEqual([
    ["@blastlauncher/protocol", true],
    ["@blastlauncher/runtime", false],
    ["@blastlauncher/engine", false],
    ["@blastlauncher/shared-deps", false],
    ["@blastlauncher/serve", false],
  ]);
  expect(lookedUp).toHaveLength(source.length);
});

test("real publishing requires an npm token", () => {
  expect(() => assertPublishToken(undefined)).toThrow("NPM_TOKEN is required");
  expect(() => assertPublishToken("  ")).toThrow("NPM_TOKEN is required");
  expect(assertPublishToken("token")).toBeUndefined();
});

test("release planning refuses an existing version tag", () => {
  expect(assertTagAvailable("3.0.0-alpha.1", () => false)).toBe("v3.0.0-alpha.1");
  expect(() => assertTagAvailable("3.0.0-alpha.1", (tag) => tag === "v3.0.0-alpha.1")).toThrow(
    "Release tag already exists",
  );
});
