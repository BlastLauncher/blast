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
