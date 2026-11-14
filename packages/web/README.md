# @blastlauncher/web

Browser-only embedding API for Blast. The package intentionally has no Node
host dependency; applications provide a cross-origin almostnode sandbox URL.

```ts
import { mount } from "@blastlauncher/web";
const session = mount(document.querySelector("#app")!, {
  extension: "raycast/extensions/example",
  sandboxUrl: "/blast-sandbox/",
});
session.input({ type: "text", text: "hello" });
```
