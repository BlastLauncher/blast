import { environment, getPreferenceValues } from "@raycast/api";

// Deliberately writes to the real stdout at import time: the runtime must turn
// this into a log message instead of corrupting the protocol stream.
process.stdout.write("raw");

export default async function Command(props) {
  console.log(
    JSON.stringify({
      props,
      commandName: environment.commandName,
      extensionName: environment.extensionName,
      preferences: getPreferenceValues(),
    }),
  );
}
