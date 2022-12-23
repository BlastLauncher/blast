import { IElement } from "./BaseElement";
import * as Primitives from "./PrimitiveElements";
import Command from "./Command";

export const elements: { [key: string]: IElement } = {
  Command,
  ...Primitives,
};
