// Logs its launch props, so a host test can see exactly what reached the
// command over the init message.
export default async function Command(props: { arguments?: Record<string, string> }) {
  console.log(
    JSON.stringify({
      args: props.arguments,
      launchType: (props as { launchType?: string }).launchType,
      launchContext: (props as { launchContext?: unknown }).launchContext,
    }),
  );
}
