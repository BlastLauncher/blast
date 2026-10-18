import { ElementTypes } from "@blastlauncher/renderer";
import { createElement } from "react";

export const ErrorBoundary = ({ error }: { error?: Error | null }) => {
  const errorMessage = String(error);
  const errorStack = String(error?.stack);
  return createElement(ElementTypes.ErrorBoundary, {
    error: errorMessage,
    errorStack,
    serializedKeys: ["error", "errorStack"],
  });
};
