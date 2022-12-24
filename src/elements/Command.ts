import BaseElement from "./BaseElement";
import { Container } from "../types";

export default class Command extends BaseElement implements Container {
  constructor(props: Record<string, any> = {}) {
    super(props, { server: props.server });
  }

  clear(): void {
    this.children = [];
  }

  get server() {
    return this.props.server;
  }
}
