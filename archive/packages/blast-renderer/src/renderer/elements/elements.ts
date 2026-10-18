import type { IElement } from "./BaseElement";
import Command from "./Command";
import * as Primitives from "./PrimitiveElements";

export const elements: { [key: string]: IElement } = {
  Command,
  ...Primitives,
};
