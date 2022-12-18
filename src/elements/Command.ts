import BaseElement from "./BaseElement";
import { Container, Props } from "../types";

export default class Command extends BaseElement implements Container {
  static propTypes: object;

  static defaultProps: Props;

  constructor(props: any = {}) {
    // Command's children can only be one of the following types
    // List, Detail

    super("CommandContainer", props);
  }

  clear(): void {
    this.children = [];
  }
}
