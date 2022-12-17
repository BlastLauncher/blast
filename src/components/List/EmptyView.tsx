import { ComponentType } from '../../elements/types';
import React from 'react';
import { createDebug } from '../../utils/debug';

const debug = createDebug('blast:components:EmptyView');

export const EmptyView = (props: any) => {
  debug(props);

  return React.createElement(ComponentType.EmptyView);
};
