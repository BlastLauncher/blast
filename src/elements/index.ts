import { IElement } from "./BaseElement";
import List from "./List";

const elements: { [key: string]: IElement } = {
  List,
};

export default function createElement(elementType: keyof typeof elements, props: any) {
  const Element: IElement = elements[elementType];
  if (!Element) throw new Error(`unknown element of type '${elementType}'`);

  return new Element(props);
}
