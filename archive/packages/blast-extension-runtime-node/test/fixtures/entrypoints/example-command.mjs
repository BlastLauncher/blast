// Immutable fixture entrypoint for the V2 runtime bootstrap tests.
export const extensionId = "fixture.extension";
export const marker = "fixture-esm-loaded";
export function run() {
  return "fixture-esm-ran";
}
