import { ElementTypes } from "@blastlauncher/renderer";
import { createElement } from "react";

export const ErrorBoundary = ({ error }: { error: Error | null | undefined }) =>
  createElement(ElementTypes.ErrorBoundary, { error, serializedKeys: ['error'] });
