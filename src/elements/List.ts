import BaseElement from "./BaseElement";
import { Props } from "../types";
import { List as RaycastList } from "@raycast/api";
import union from "lodash/union";

const navigationProps = ["navigationTitle", "isLoading"];

const searchBarProps = ["filtering", "isLoading", "throttle"];

const listProps = ["searchText", "enableFiltering", "searchBarPlaceholder", "selectedItemId", "isShowingDetail"];

export default class List extends BaseElement {
  static propTypes: object;

  static defaultProps: Props;

  constructor(type: string, props: RaycastList.Props = {}) {
    super(type, props);
  }

  propsForSerialize(): string[] {
    return union(navigationProps, searchBarProps, listProps);
  }
}
