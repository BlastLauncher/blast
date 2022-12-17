import BaseElement from "./BaseElement";
import { Props } from "../types";

export default class List extends BaseElement {
  static propTypes: object;

  static defaultProps: Props;

  constructor(props: Props = {}) {
    super([], props);
  }
}
