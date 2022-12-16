import React from 'react';

export const useNavigation = () => {
  const push = (component: React.ReactNode) => {};

  const pop = () => {};

  return {
    push,
    pop,
  };
};

export const Form = () => {};

export const Action = () => {};

export const ActionPanel = () => {};

export const Icon = () => {};

export * from './components/List';
export * from './components/LocalStorage';
