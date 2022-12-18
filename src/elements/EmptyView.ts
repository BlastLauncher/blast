import BaseElement from "./BaseElement";
import { Props } from "../types";
import { List as RaycastList } from "@raycast/api";

export default class EmptyView extends BaseElement {
  static propTypes: object;

  static defaultProps: Props;

  constructor(type: string, props: RaycastList.EmptyView.Props = {}) {
    super(type, props);
  }

  propsForSerialize(): string[] {
    return ["title", "description"];
  }
}
