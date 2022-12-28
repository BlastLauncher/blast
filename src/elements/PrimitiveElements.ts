import pick from "lodash/pick";

import { createDebug } from "../utils/debug";

import BaseElement from "./BaseElement";

const debug = createDebug("blast:elements:ExtendedElements");

export class View extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class List extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class ActionPanel extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class EmptyView extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);

    debug(`EmptyView:constructor(${props})`);
  }
}

export class Action extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class Detail extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class Form extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class TextField extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class NavigationRoot extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }

  serialize() {
    return {
      elementType: this.constructor.name,
      props: pick(this.props, this.props.serializesKeys),
      children: this.children.slice(-1).map((child) => child.serialize()),
    };
  }
}

export class ListItem extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}
