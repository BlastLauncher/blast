import './preloadDevtool';

import React from 'react';
import { render } from './render';
import Command from '../examples/todo-list/src/index';

render(React.createElement(Command), {});
