import BaseElement from "./BaseElement";
import { Props } from "../types";

export default class Command extends BaseElement {
  static propTypes: object;

  static defaultProps: Props;

  constructor(props: any = {}) {
    // Command's children can only be one of the following types
    // List, Detail

    super("CommandContainer", props);
  }
}
