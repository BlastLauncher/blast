declare namespace JSX {
  import { ReactNode, Ref } from "react";

  interface IntrinsicElements {
    List: {
      ref?: Ref<any>;
      children?: ReactNode;
    };
  }
}
