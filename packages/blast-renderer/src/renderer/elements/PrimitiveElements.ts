import { createDebug } from "@blastlauncher/utils/src";
import pick from "lodash/pick";

import BaseElement from "./BaseElement";

const debug = createDebug("blast:elements:ExtendedElements");

export class View extends BaseElement {
  static defaultProps = {};
}

export class List extends BaseElement {
  static defaultProps = {};

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
}

export class ActionPanelSection extends BaseElement {
  static defaultProps = {};
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
}

export class Detail extends BaseElement {
  static defaultProps = {};
}

export class Form extends BaseElement {
  static defaultProps = {};
}

export class TextField extends BaseElement {
  static defaultProps = {};
}

export class NavigationRoot extends BaseElement {
  static defaultProps = {};

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
}

export class Icon extends BaseElement {
  static defaultProps = {};
}

export class ErrorBoundary extends BaseElement {
  static defaultProps = {}
}

export class Dropdown extends BaseElement {
  static defaultProps = {}
}

export class DropdownSection extends BaseElement {
  static defaultProps = {}
}

export class DropdownItem extends BaseElement {
  static defaultProps = {}
}
