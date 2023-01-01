# Blast (aka C8763)

Blast is an open-source educational and experimental project that aims to utilize the extension ecosystem of Raycast Launcher, a closed-source platform built on top of React. In Raycast, extensions are implemented using custom React components, and each command within an extension can be thought of as a separate React application. Blast provides an open-source React renderer to render these Raycast extensions.

## Demo

![demo_todo](./docs/media/demo_todo.gif)

## Architecture

Blast uses the following components:

- Node.js to write the backend and implement a custom React renderer with `react-reconciler`
- Electron & React.js to write the front end and render the React element tree as HTML
- Use `rpc-websockets` to communicate between the backend and front end

In the architecture of Blast, the backend uses a Node.js engine and the react-reconciler package to implement a custom React renderer. The element tree created during this process is then emitted as a JSON object tree to the front end, which is an Electron app built with React.js and rendered as HTML. While the front end is built with React, it is also framework agnostic as it can accept the plain JSON element tree from the backend.

For higher performance, a custom renderer such as React-native may send operations to the host app to build a shadow element tree alongside the renderer. However, Blast was designed for educational and experimental purposes and therefore emits the entire element tree as JSON during the resetAfterCommit phase, which is called every time the component is updated. This is less performant but sufficient for the needs of this project as the component tree is not complex and high performance is not required.

## Development

```bash
npm install

npx react-devtools # Start react devtools
npm run dev # Start webpack incremental build
npm run start:dev # nodemon start bundle
```

## Inspiration and related projects

- [SunbeamLauncher](https://github.com/SunbeamLauncher/sunbeam): A frontend agnostic Launcher app, written in Go, and you can write extensions in any language.
- [⌘K, cmdk][https://github.com/pacocoursey/cmdk]: A launcher React.js Component. The front end of Blast is based on this project. The author also provided several launcher themes, such as Linear, Raycast and Vercel, but they are only for demo purposes so you need to modify them to use.

## FAQs

### Why naming blast?

Because I ask ChatGPT to find words similar to "raycast" 🤣

### Why C8763?

[label](https://www.google.com/url?sa%3Di%26url%3Dhttps%3A%2F%2Fforum.gamer.com.tw%2FCo.php%3Fbsn%3D60076%26sn%3D35393481%26psig%3DAOvVaw1E2lTYKMdW0CFwT7gzrCfb%26ust%3D1672659465987000%26source%3Dimages%26cd%3Dvfe%26ved%3D0CA8QjRxqFwoTCOD_75ukpvwCFQAAAAAdAAAAABAE)

Blast（爆破）應該滿星爆的吧！
