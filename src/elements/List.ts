import BaseElement from "./BaseElement";
import { Props } from "../types";
import { List as RaycastList } from "@raycast/api";

export default class List extends BaseElement {
  static propTypes: object;

  static defaultProps: Props;

  constructor(props: RaycastList.Props = {}) {
    super([], props);
  }
}
