import React from "react";

import { render } from "../renderer";

describe("JSON renderer", () => {
  it("serializes a React tree after the commit completes", async () => {
    const root = render(
      React.createElement(
        "List",
        { serializedKeys: ["navigationTitle"], navigationTitle: "Test" },
        React.createElement("ListItem", { serializedKeys: ["title"], title: "Hello" }),
      ),
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(root.serialize()).toEqual({
      elementType: "Command",
      props: {},
      children: [
        {
          elementType: "List",
          props: { navigationTitle: "Test" },
          children: [{ elementType: "ListItem", props: { title: "Hello" }, children: [] }],
        },
      ],
    });
  });
});
