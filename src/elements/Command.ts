import BaseElement from "./BaseElement";
import { Container, Props } from "../types";

export default class Command extends BaseElement implements Container {
  static defaultProps: Props = {
    elementType: "Command",
  };

  constructor(props: any = {}) {
    super(props);
  }

  clear(): void {
    this.children = [];
  }
}
