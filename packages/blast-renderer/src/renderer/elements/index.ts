import { createDebug } from "blast-utils";

export const debug = createDebug("blast:elements:index");

import createElement from "./createElement";

export default createElement;

export * from "./elements";
export * as ElementTypes from "./types";
