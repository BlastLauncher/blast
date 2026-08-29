import { AI, Action, ActionPanel, List, OAuth, updateCommandMetadata } from "@raycast/api";
import { useEffect, useState } from "react";

const oauthClient = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Fixture OAuth",
  providerId: "fixture-oauth",
});

export default function Command() {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    let active = true;
    void (async () => {
      const answer = await AI.ask("fixture prompt", {
        creativity: "low",
        model: AI.Model["OpenAI_GPT4o-mini"],
      });
      await updateCommandMetadata({ subtitle: "AI ready" });
      const tokens = await oauthClient.getTokens();
      if (active) {
        setStatus(`${answer}:${tokens === undefined ? "signed-out" : "signed-in"}`);
      }
    })().catch((error: unknown) => {
      if (active) {
        setStatus(`error:${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <List navigationTitle={`Runtime:${status}`}>
      <List.Item title="AI and OAuth" actions={<ActionPanel><Action title="Ready" /></ActionPanel>} />
    </List>
  );
}
