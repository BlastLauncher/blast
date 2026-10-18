// Immutable fixture command for the end-to-end vertical slice.
export async function command(context) {
  await context.publish({
    transactionId: "e2e-snapshot",
    operations: [
      {
        type: "snapshot",
        root: {
          id: "root",
          type: "list",
          props: { navigationTitle: "E2E" },
          children: [
            {
              id: "item-1",
              type: "list-item",
              props: { title: "Hello" },
              children: [
                {
                  id: "action-1",
                  type: "action",
                  props: { title: "Run", onAction: "event-action-1" },
                  children: [],
                },
              ],
            },
          ],
        },
      },
    ],
  });

  context.onEvent(async (event) => {
    const write = await context.requestCapability({
      capability: "clipboard",
      operation: "write",
      arguments: { text: "from-e2e" },
    });
    const read = await context.requestCapability({ capability: "clipboard", operation: "read" });
    await context.publish({
      transactionId: "e2e-update",
      operations: [
        {
          type: "update",
          nodeId: "item-1",
          props: { title: `Ran:${event.eventId}`, subtitle: `${write.outcome}:${read.outcome}` },
        },
      ],
    });
  });
}
