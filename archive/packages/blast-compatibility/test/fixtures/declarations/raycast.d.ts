export declare const Config: Readonly<{
  readonly local: string;
  readonly dynamic: { readonly required: string };
}>;

export declare const Component: {
  readonly displayName: string;
  readonly propTypes: unknown;
  readonly Ready: true;
};

export declare enum Icon {
  Add = "add",
  Remove = "remove",
}

export declare class Cache {
  private secret;
  static readonly version: string;
  get(key: string): string | undefined;
}

export declare namespace Cache {
  type Options = { readonly namespace?: string };
}

export { Color } from "./color.js";
