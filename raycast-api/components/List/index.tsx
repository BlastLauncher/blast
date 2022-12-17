import React from 'react';
import { Dropdown } from './Dropdown';
import logger from '../../../src/logger';

const LIST = 'LIST';
const EMPTY_VIEW = 'EMPTY_VIEW';

export const List = (props: any) => {
  logger.debug(props);

  return React.createElement(LIST, props);
};

export const EmptyView = (props: any) => {
  logger.debug(props);
  return React.createElement(EMPTY_VIEW);
};

List.Dropdown = Dropdown;
List.EmptyView = EmptyView;
