declare namespace JSX {
  import { ReactNode, Ref } from "react";

  interface IntrinsicElements {
    ActionPanel: {
      ref?: Ref<any>;
      serializesKeys?: string[];
      children?: ReactNode;
    };
    Action: {
      ref?: Ref<any>;
      serializesKeys?: string[];
    };
    List: {
      ref?: Ref<any>;
      serializesKeys?: string[];
      children?: ReactNode;
    };
    EmptyView: {
      ref?: Ref<any>;
      serializesKeys?: string[];
      children?: ReactNode;
    };
  }
}
