import { OAuth } from "@raycast/api";
import { OAuthService } from "@raycast/utils";

export default async function Command() {
  const client = new OAuth.PKCEClient({
    redirectMethod: OAuth.RedirectMethod.Web,
    providerName: "Fixture",
  });
  await client.authorize(
    await client.authorizationRequest({
      endpoint: "https://provider.example/auth",
      clientId: "fixture",
      scope: "read",
    }),
  );
  await client.setTokens({
    access_token: "private-access-token",
    refresh_token: "private-refresh-token",
    expires_in: 3600,
  });
  const service = new OAuthService({
    client,
    clientId: "fixture",
    authorizeUrl: "https://provider.example/auth",
    tokenUrl: "https://provider.example/token",
    scope: "read",
  });
  if ((await service.authorize()) !== "private-access-token")
    throw new Error("OAuthService did not reuse tokens");
}
