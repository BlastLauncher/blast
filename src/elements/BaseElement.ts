// Big thanks to https://github.com/clayrisser/create-react-renderer
import { BaseNode, Node, Instance, Props } from "../types";

export interface IElement {
  new (props?: Props): BaseElement;
  propTypes: object;
  defaultProps: Props;
}

export default class BaseElement implements Instance {
  static defaultProps: Props = {};

  static propTypes: object = {};

  node: Node;

  children: Instance[] = [];
  props: Props = {};

  constructor(baseNode: BaseNode | BaseNode[], _props: Props = {}) {
    if (Array.isArray(baseNode)) throw new Error("cannot be array");
    this.node = baseNode;
  }

  appendChild(_child: BaseElement) {
    // noop
  }

  removeChild(_child: BaseElement) {
    // noop
  }

  commitMount() {
    // noop
  }

  commitUpdate(_newProps: Props) {
    // noop
  }
}
