# `@blastlauncher/renderer`

 `@blastlauncher/renderer` is the core of Blast Launcher.

It is a custom React renderer that implements the `react-reconciler` package. It is used to render the React element tree as JSON. Also it provides a websocket server.

There's currently no component checks, so developers might misuse the components and cause unexpected behaviors.

## Architecture

- Most elements are implemented in `./renderer/elements`.
- The reconciler is implemented in `./renderer/reconciler.ts`.
- The websocket server is implemented in `./server.ts`.

```bash
.
├── @types
│   └── svgImports.d.ts
├── README.md
├── __tests__
│   └── hello.test.ts
├── index.ts
├── renderer
│   ├── elements
│   │   ├── BaseElement.ts
│   │   ├── Command.ts
│   │   ├── PrimitiveElements.ts
│   │   ├── createElement.ts
│   │   ├── elements.ts
│   │   ├── index.ts
│   │   └── types.ts
│   ├── index.ts
│   ├── reconciler.ts
│   ├── render.ts
│   └── types.ts
└── server.ts
```

## Adding new elements

When implementing the `@blastlauncher/api` and you found there's no supported base element, you can add it in `PrimitiveElements.ts`. Remember also update the typing in `renderer/elements/types.ts`.

