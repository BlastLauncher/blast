import { IElement } from "./BaseElement";
import { elements } from "./elements";
import { debug } from ".";

export default function createElement(elementType: keyof typeof elements, props: any) {
  const Element: IElement = elements[elementType];

  debug(`createElement(${elementType})`);

  if (!Element) throw new Error(`unknown element of type '${elementType}'`);

  return new Element(props);
}
