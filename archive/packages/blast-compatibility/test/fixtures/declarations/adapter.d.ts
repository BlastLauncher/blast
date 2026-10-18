export declare const Config: Readonly<Record<string, string>>;

export declare const Component: {
  readonly displayName: string;
  readonly propTypes: unknown;
  readonly Ready: true;
};

export declare const Icon: {
  readonly Add: "add";
};

export declare class Cache {
  private adapterSecret;
  static readonly version: string;
}

export declare namespace Cache {
  type Options = { readonly namespace?: string };
}

export { Color } from "./adapter-color.js";
