// Big thanks to https://github.com/clayrisser/create-react-renderer
import pick from "lodash/pick";
import PropTypes, { checkPropTypes } from "prop-types";

import { HostContext, Instance, Props } from "../types";
import { createDebug } from "../utils/debug";

const debug = createDebug("blast:elements:BaseElement");

export interface IElement {
  new (props?: Props, hostContext?: HostContext): BaseElement;
  propTypes?: object;
  defaultProps?: Props;
}

export default class BaseElement implements Instance {
  static propTypes: object = {
    serializedKeys: PropTypes.arrayOf(PropTypes.string),
  };

  children: BaseElement[] = [];
  props: Props = {};
  propsForSerialize: string[] = [];
  _hostContext = {};

  constructor(props: Props = {}, hostContext: HostContext = {}) {
    this.props = this.getProps(props);
    this._hostContext = hostContext;
  }

  appendChild(_child: BaseElement) {
    debug(`${this.constructor.name}:appendChild(${_child})`);
    this.children.push(_child as BaseElement);
  }

  insertBefore(_child: BaseElement, _beforeChild: BaseElement) {
    debug(`${this.constructor.name}:insertBefore(${_child}, ${_beforeChild})`);

    const existingIndex = this.children.indexOf(_child);
    const index = this.children.indexOf(_beforeChild);

    if (existingIndex > -1) {
      this.children.splice(existingIndex, 1);
    }

    this.children.splice(index + 1, 0, _child);
  }

  removeChild(_child: BaseElement) {
    debug(`${this.constructor.name}:removeChild()`);
    this.children.splice(this.children.indexOf(_child), 1);
  }

  commitMount() {
    // noop
    debug(`${this.constructor.name}:commitMount()`);
  }

  commitUpdate(_newProps: Props) {
    debug(`${this.constructor.name}:commitUpdate()`);

    this.props = {
      ...this.props,
      ..._newProps,
    };
  }

  // serialize to JSON
  serialize(): any {
    return {
      elementType: this.constructor.name,
      props: pick(this.props, this.props.serializedKeys),
      children: this.children.map((child) => child.serialize()),
    };
  }

  getProps(props: Props): Props {
    props = { ...props };
    const { defaultProps = {}, propTypes } = this.constructor as IElement;
    Object.keys(defaultProps).forEach((key) => {
      const defaultProp = defaultProps[key];
      if (typeof props[key] === "undefined" || props[key] === null) {
        props[key] = defaultProp;
      }
    });

    checkPropTypes(propTypes, props, "prop", this.constructor.name);

    return props;
  }

  get elementType() {
    return this.constructor.name;
  }

  get hostContext() {
    return this._hostContext;
  }
}
