import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { OAuth } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

// @covers OAuth
// @covers OAuth.PKCEClient
// @covers OAuth.PKCEClient.constructor
// @covers OAuth.PKCEClient.Options
// @covers OAuth.PKCEClient.Options.description
// @covers OAuth.PKCEClient.Options.providerIcon
// @covers OAuth.PKCEClient.Options.providerId
// @covers OAuth.PKCEClient.Options.providerName
// @covers OAuth.PKCEClient.Options.redirectMethod
// @covers OAuth.PKCEClient.description
// @covers OAuth.PKCEClient.providerIcon
// @covers OAuth.PKCEClient.providerId
// @covers OAuth.PKCEClient.providerName
// @covers OAuth.PKCEClient.redirectMethod
// @covers OAuth.PKCEClient.authorizationRequest
// @covers OAuth.AuthorizationRequest
// @covers OAuth.AuthorizationRequest.clientId
// @covers OAuth.AuthorizationRequest.codeChallenge
// @covers OAuth.AuthorizationRequest.codeVerifier
// @covers OAuth.AuthorizationRequest.redirectURI
// @covers OAuth.AuthorizationRequest.state
// @covers OAuth.AuthorizationRequest.toURL
// @covers OAuth.AuthorizationRequestURLParams
// @covers OAuth.AuthorizationRequestURLParams.clientId
// @covers OAuth.AuthorizationRequestURLParams.codeChallenge
// @covers OAuth.AuthorizationRequestURLParams.codeVerifier
// @covers OAuth.AuthorizationRequestURLParams.redirectURI
// @covers OAuth.AuthorizationRequestURLParams.state
// @covers OAuth.AuthorizationRequestOptions
// @covers OAuth.AuthorizationRequestOptions.clientId
// @covers OAuth.AuthorizationRequestOptions.endpoint
// @covers OAuth.AuthorizationRequestOptions.extraParameters
// @covers OAuth.AuthorizationRequestOptions.scope
// @covers OAuth.RedirectMethod
// @covers OAuth.RedirectMethod.Web
// @covers OAuth.RedirectMethod.App
// @covers OAuth.RedirectMethod.AppURI
// @covers OAuth.RedirectMethod.ClientIdMetadataDocument
// @covers OAuth.ClientIdMetadataDocumentAuthorizationRequestOptions
// @covers OAuth.ClientIdMetadataDocumentAuthorizationRequestOptions.clientId
// @covers OAuth.clientIdMetadataDocument
test("PKCE requests use S256, independent random state and documented redirect URLs", async () => {
  const redirects = [
    "https://raycast.com/redirect?packageName=Extension",
    "raycast://oauth?package_name=Extension",
    "com.raycast:/oauth?package_name=Extension",
    "https://raycast.com/redirect?packageName=Extension",
  ];
  for (const [i, redirectMethod] of Object.values(OAuth.RedirectMethod).entries()) {
    const client = new OAuth.PKCEClient({
      redirectMethod,
      providerName: "Provider",
      providerId: "account",
      providerIcon: "icon.png",
      description: "Connect",
    });
    expect([
      client.redirectMethod,
      client.providerName,
      client.providerId,
      client.providerIcon,
      client.description,
    ]).toEqual([redirectMethod, "Provider", "account", "icon.png", "Connect"]);
    const request = await client.authorizationRequest({
      endpoint: "https://provider.example/auth?existing=1",
      clientId: "client",
      scope: "read write",
    });
    expect(request.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.codeChallenge).toBe(
      createHash("sha256").update(request.codeVerifier).digest("base64url"),
    );
    expect(request.redirectURI).toBe(redirects[i]!);
    expect(Object.fromEntries(new URL(request.toURL()).searchParams)).toEqual({
      existing: "1",
      response_type: "code",
      client_id: request.clientId,
      redirect_uri: redirects[i]!,
      scope: "read write",
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256",
    });
    const other = await client.authorizationRequest({
      endpoint: "https://provider.example/auth",
      clientId: "client",
      scope: "",
      extraParameters: { redirect_uri: "https://raycast.com/redirect/extension", audience: "api" },
    });
    expect(other.state).not.toBe(request.state);
    expect(other.codeVerifier).not.toBe(request.codeVerifier);
    expect(other.redirectURI).toBe("https://raycast.com/redirect/extension");
    expect(new URL(other.toURL()).searchParams.get("audience")).toBe("api");
  }
  const client = new OAuth.PKCEClient({
    redirectMethod: OAuth.RedirectMethod.ClientIdMetadataDocument,
    providerName: "Provider",
  });
  expect(client.providerId).toBe("Provider");
  expect(
    (await client.authorizationRequest({ endpoint: "https://provider.example/auth", scope: "" }))
      .clientId,
  ).toBe(OAuth.clientIdMetadataDocument);
  expect(
    (
      await client.authorizationRequest({
        endpoint: "https://provider.example/auth",
        scope: "",
        clientId: "override",
      })
    ).clientId,
  ).toBe("override");
});

// @covers OAuth.PKCEClient.authorize
// @covers OAuth.AuthorizationOptions
// @covers OAuth.AuthorizationOptions.url
// @covers OAuth.AuthorizationResponse
// @covers OAuth.AuthorizationResponse.authorizationCode
test("authorize sends URL and provider metadata and propagates denials", async () => {
  const client = new OAuth.PKCEClient({
    redirectMethod: "web",
    providerName: "Provider",
    providerIcon: "icon.png",
    description: "Connect",
  });
  const request = await client.authorizationRequest({
    endpoint: "https://provider.example/auth",
    clientId: "client",
    scope: "read",
  });
  setCapabilityRequester(async (name, params) => {
    expect(name).toBe("oauth.authorize");
    expect(params).toEqual({
      url: request.toURL(),
      providerName: "Provider",
      providerId: "Provider",
      providerIcon: "icon.png",
      description: "Connect",
      redirectMethod: "web",
    });
    return { authorizationCode: "code" };
  });
  expect(await client.authorize(request)).toEqual({ authorizationCode: "code" });
  expect(await client.authorize({ url: request.toURL() })).toEqual({ authorizationCode: "code" });
  setCapabilityRequester(async () => {
    throw new Error("Capability denied: oauth.authorize");
  });
  await expect(client.authorize(request)).rejects.toThrow("Capability denied");
  setCapabilityRequester(async () => null);
  await expect(client.authorize(request)).rejects.toThrow("Invalid OAuth authorization response");
});

// @covers OAuth.PKCEClient.setTokens
// @covers OAuth.PKCEClient.getTokens
// @covers OAuth.PKCEClient.removeTokens
// @covers OAuth.TokenResponse
// @covers OAuth.TokenResponse.access_token
// @covers OAuth.TokenResponse.expires_in
// @covers OAuth.TokenResponse.id_token
// @covers OAuth.TokenResponse.refresh_token
// @covers OAuth.TokenResponse.scope
// @covers OAuth.TokenSet
// @covers OAuth.TokenSet.accessToken
// @covers OAuth.TokenSet.expiresIn
// @covers OAuth.TokenSet.idToken
// @covers OAuth.TokenSet.isExpired
// @covers OAuth.TokenSet.refreshToken
// @covers OAuth.TokenSet.scope
// @covers OAuth.TokenSet.updatedAt
// @covers OAuth.TokenSetOptions
// @covers OAuth.TokenSetOptions.accessToken
// @covers OAuth.TokenSetOptions.expiresIn
// @covers OAuth.TokenSetOptions.idToken
// @covers OAuth.TokenSetOptions.refreshToken
// @covers OAuth.TokenSetOptions.scope
test("token responses normalize, rehydrate Dates and check expiry with a buffer", async () => {
  let stored: JsonValue = null;
  setCapabilityRequester(async (name, params) => {
    expect(params.providerId).toBe("Provider");
    if (name === "oauth.tokens.set")
      stored = {
        ...(params.tokens as Record<string, JsonValue>),
        updatedAt: "2000-01-01T00:00:00.000Z",
      };
    if (name === "oauth.tokens.remove") stored = null;
    return name === "oauth.tokens.get" ? stored : null;
  });
  const client = new OAuth.PKCEClient({ redirectMethod: "web", providerName: "Provider" });
  expect(await client.getTokens()).toBeUndefined();
  await client.setTokens({
    access_token: "access",
    refresh_token: "refresh",
    id_token: "id",
    expires_in: 3600,
    scope: ["read", "write"],
  });
  const tokens = (await client.getTokens())!;
  expect(tokens).toMatchObject({
    accessToken: "access",
    refreshToken: "refresh",
    idToken: "id",
    expiresIn: 3600,
    scope: "read write",
    updatedAt: new Date("2000-01-01"),
  });
  expect(tokens.isExpired()).toBe(true);
  await client.setTokens({
    accessToken: "other",
    refreshToken: "r",
    idToken: "i",
    expiresIn: 1e12,
    scope: "read",
  });
  expect((await client.getTokens())!.isExpired()).toBe(false);
  await client.setTokens({ accessToken: "other" });
  expect((await client.getTokens())!.isExpired()).toBe(false);
  // A token whose actual expiry is still five seconds away is already expired.
  stored = {
    accessToken: "buffered",
    expiresIn: 3600,
    updatedAt: new Date(Date.now() - 3595000).toISOString(),
  };
  expect((await client.getTokens())!.isExpired()).toBe(true);
  await client.removeTokens();
  expect(await client.getTokens()).toBeUndefined();
});
