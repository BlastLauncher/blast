import React from "react";

export const useNavigation = () => {
  const push = (component: React.ReactNode) => {
    // noop
  };

  const pop = () => {
    // noop
  };

  return {
    push,
    pop,
  };
};

export const Form = () => {
  // TODO
};

export const Icon = () => {
  // TODO
};

export * from "./components/List";
export * from "./components/LocalStorage";
