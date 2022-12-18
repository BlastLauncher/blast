import { IElement } from "./BaseElement";
import List from "./List";
import EmptyView from "./EmptyView";
import Command from "./Command";

const elements: { [key: string]: IElement } = {
  List,
  EmptyView,
  Command,
};

export default function createElement(elementType: keyof typeof elements, props: any) {
  const Element: IElement = elements[elementType];
  if (!Element) throw new Error(`unknown element of type '${elementType}'`);

  return new Element(elementType as string, props);
}
