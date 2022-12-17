import { ComponentType } from '../../constants';
import React from 'react';
import { createDebug } from '../../../src/debug';

const debug = createDebug('blast:components:EmptyView');

export const EmptyView = (props: any) => {
  debug(props);

  return React.createElement(ComponentType.EmptyView);
};
