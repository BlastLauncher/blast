export type ObjectFromList<T extends ReadonlyArray<string>, V = string> = {
  [K in T extends ReadonlyArray<infer U> ? U : never]: V;
};
