// Big thanks to https://github.com/clayrisser/create-react-renderer
import { Instance, Props } from "../types";
import { createDebug } from "../utils/debug";
import pick from "lodash/pick";

const debug = createDebug("blast:elements:BaseElement");

export interface IElement {
  new (type: string, props?: Props): BaseElement;
  propTypes: object;
  defaultProps: Props;
}

export default class BaseElement implements Instance {
  static defaultProps: Props = {};
  static propTypes: object = {};

  children: BaseElement[] = [];
  props: Props = {};
  elementType = "BaseElement";

  constructor(type: string, props: Props = {}) {
    this.props = props;
    this.elementType = type;
  }

  appendChild(_child: BaseElement) {
    debug(`appendChild(${_child})`);
    this.children.push(_child as BaseElement);
  }

  removeChild(_child: BaseElement) {
    debug(`removeChild()`);
    this.children.splice(this.children.indexOf(_child), 1);
  }

  commitMount() {
    // noop
    debug(`commitMount()`);
  }

  commitUpdate(_newProps: Props) {
    debug(`commitUpdate()`);
    this.props = _newProps;
  }

  // serialize to JSON
  serialize(): any {
    debug(`serialize()`);

    return {
      elementType: this.elementType,
      props: pick(this.props, this.propsForSerialize()),
      children: this.children.map((child) => child.serialize()),
    };
  }

  // Preserve props that can be serialized
  propsForSerialize(): string[] {
    return Object.keys(this.props);
  }
}
