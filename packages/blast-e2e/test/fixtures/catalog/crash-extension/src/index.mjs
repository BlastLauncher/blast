// Immutable fixture command that publishes a scene and then crashes deliberately.
export async function command(context) {
  await context.publish({
    transactionId: "crash-snapshot",
    operations: [
      {
        type: "snapshot",
        root: { id: "root", type: "list", props: {}, children: [] },
      },
    ],
  });
  process.exit(43);
}
