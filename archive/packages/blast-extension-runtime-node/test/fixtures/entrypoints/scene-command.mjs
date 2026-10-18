// Immutable fixture command that publishes a list and reacts to its action.
export async function command(context) {
  await context.publish({
    transactionId: "fixture-snapshot",
    operations: [
      {
        type: "snapshot",
        root: {
          id: "root",
          type: "list",
          props: { navigationTitle: "Fixture" },
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

  context.onEvent((event) => {
    return context.publish({
      transactionId: "fixture-update",
      operations: [
        { type: "update", nodeId: "item-1", props: { title: `Ran:${event.eventId}` } },
      ],
    });
  });
}
