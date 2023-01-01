# Blast (aka C8763)

Blast is an open-source educational project that aims to utilize the extension ecosystem of Raycast Launcher, a closed-source platform built on top of React. In Raycast, extensions are implemented using custom React components, and each command within an extension can be thought of as a separate React application. Blast provides an open-source React renderer to render these Raycast extensions.

## Demo

![demo_todo](./docs/images/demo_todo.mp4)

## Architecture

Blast uses the following components:

- Node.js engine
- react-reconciler package
- React.js
- Electron

In the architecture of Blast, the backend uses a Node.js engine and the react-reconciler package to implement a custom React renderer. The element tree created during this process is then emitted as a JSON object tree to the front end, which is an Electron app built with React.js and rendered as HTML. While the front end is built with React, it is also framework agnostic as it can accept the plain JSON element tree from the backend.

For higher performance, a custom renderer such as React-native may send operations to the host app to build a shadow element tree alongside the renderer. However, Blast was designed for educational and experimental purposes and therefore emits the entire element tree as JSON during the resetAfterCommit phase, which is called every time the component is updated. This is less performant but sufficient for the needs of this project as the component tree is not complex and high performance is not required.

## Development

```bash
npm install

npx react-devtools # Start react devtools
npm run dev # Start webpack incremental build
npm run start:dev # nodemon start bundle
```
