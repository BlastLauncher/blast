import { createDebug } from "@blast/utils";
import pick from "lodash/pick";

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

  serialize() {
    // TODO: when there's no ListItem nor EmptyView provided
    // Return an EmptyView with default property

    let children;
    if (this.children.find((child) => child instanceof ListItem)) {
      children = this.children.filter((child) => !(child instanceof EmptyView)).map((child) => child.serialize());
    } else {
      children = this.children.map((child) => child.serialize());
    }

    return {
      elementType: this.constructor.name,
      props: pick(this.props, this.props.serializedKeys),
      children,
    };
  }
}

export class ActionPanel extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}

export class ActionPanelSection extends BaseElement {
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
      props: pick(this.props, this.props.serializedKeys),
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

export class Icon extends BaseElement {
  static defaultProps = {};

  constructor(props: any) {
    super(props);
  }
}
