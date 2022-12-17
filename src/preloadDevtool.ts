import { connectToDevTools } from 'react-devtools-core/backend';
import { w3cwebsocket as W3CWebSocket } from 'websocket';

connectToDevTools({
  websocket: new W3CWebSocket('ws://localhost:8097'),
});
