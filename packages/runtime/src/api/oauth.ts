import { createHash, randomBytes } from "node:crypto";
import type { JsonValue } from "../reconciler/index.ts";
import { requestCapability } from "./capability.ts";
import { OAuth as enums } from "./enums.generated.ts";

export type RedirectMethod = (typeof enums.RedirectMethod)[keyof typeof enums.RedirectMethod];
export type PKCEClientOptions = {
  redirectMethod: RedirectMethod;
  providerName: string;
  providerIcon?: JsonValue;
  providerId?: string;
  description?: string;
};
export type AuthorizationRequestOptions = {
  endpoint: string;
  clientId: string;
  scope: string;
  extraParameters?: Record<string, string>;
};
export type ClientIdMetadataDocumentAuthorizationRequestOptions = Omit<
  AuthorizationRequestOptions,
  "clientId"
> & { clientId?: string };
export type AuthorizationRequestURLParams = {
  clientId?: string;
  codeChallenge: string;
  codeVerifier: string;
  state: string;
  redirectURI: string;
};
export type AuthorizationRequest = AuthorizationRequestURLParams & {
  clientId: string;
  toURL(): string;
};
export type AuthorizationOptions = { url: string };
export type AuthorizationResponse = { authorizationCode: string };
export type TokenSetOptions = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  scope?: string | string[];
};
export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string | string[];
};
export type TokenSet = Omit<TokenSetOptions, "scope"> & {
  scope?: string;
  updatedAt: Date;
  isExpired(): boolean;
};
const clientIdMetadataDocument =
  "https://www.raycast.com/.well-known/oauth-client-metadata/raycast.json";
const redirects: Record<RedirectMethod, string> = {
  web: "https://raycast.com/redirect?packageName=Extension",
  app: "raycast://oauth?package_name=Extension",
  appURI: "com.raycast:/oauth?package_name=Extension",
  clientIdMetadataDocument: "https://raycast.com/redirect?packageName=Extension",
};

class PKCEClient<M extends RedirectMethod = RedirectMethod> {
  redirectMethod: M;
  providerName: string;
  providerIcon?: JsonValue;
  providerId: string;
  description?: string;

  constructor(options: PKCEClientOptions & { redirectMethod: M }) {
    this.redirectMethod = options.redirectMethod;
    this.providerName = options.providerName;
    this.providerId = options.providerId ?? options.providerName;
    if (options.providerIcon !== undefined) this.providerIcon = options.providerIcon;
    if (options.description !== undefined) this.description = options.description;
    if (!redirects[this.redirectMethod]) throw new TypeError("Unknown OAuth redirect method");
  }

  authorizationRequest(
    this: PKCEClient<"clientIdMetadataDocument">,
    options: ClientIdMetadataDocumentAuthorizationRequestOptions,
  ): Promise<AuthorizationRequest>;
  authorizationRequest(options: AuthorizationRequestOptions): Promise<AuthorizationRequest>;
  async authorizationRequest(
    options: ClientIdMetadataDocumentAuthorizationRequestOptions,
  ): Promise<AuthorizationRequest> {
    const clientId =
      options.clientId ??
      (this.redirectMethod === "clientIdMetadataDocument" ? clientIdMetadataDocument : undefined);
    if (!clientId) throw new TypeError("OAuth authorizationRequest requires a clientId");
    const codeVerifier = randomBytes(32).toString("base64url");
    const request: AuthorizationRequest = {
      clientId,
      codeVerifier,
      codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
      state: randomBytes(32).toString("base64url"),
      redirectURI: options.extraParameters?.redirect_uri ?? redirects[this.redirectMethod],
      toURL() {
        const url = new URL(options.endpoint);
        const params = {
          response_type: "code",
          client_id: request.clientId,
          redirect_uri: request.redirectURI,
          scope: options.scope,
          state: request.state,
          code_challenge: request.codeChallenge,
          code_challenge_method: "S256",
          ...options.extraParameters,
        };
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        return url.toString();
      },
    };
    return request;
  }

  async authorize(
    options: AuthorizationRequest | AuthorizationOptions,
  ): Promise<AuthorizationResponse> {
    const url = "url" in options ? options.url : options.toURL();
    if (!["https:", "http:"].includes(new URL(url).protocol))
      throw new TypeError("OAuth authorization URL must use HTTP or HTTPS");
    const metadata: Record<string, JsonValue> = {
      url,
      providerName: this.providerName,
      providerId: this.providerId,
      redirectMethod: this.redirectMethod,
    };
    if (this.providerIcon !== undefined) metadata.providerIcon = this.providerIcon;
    if (this.description !== undefined) metadata.description = this.description;
    const result = await requestCapability("oauth.authorize", metadata);
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      typeof result.authorizationCode !== "string"
    )
      throw new Error("Invalid OAuth authorization response");
    return { authorizationCode: result.authorizationCode };
  }

  async setTokens(options: TokenSetOptions | TokenResponse): Promise<void> {
    const values =
      "access_token" in options
        ? {
            accessToken: options.access_token,
            refreshToken: options.refresh_token,
            idToken: options.id_token,
            expiresIn: options.expires_in,
            scope: options.scope,
          }
        : options;
    const tokens: Record<string, JsonValue> = { accessToken: values.accessToken };
    for (const key of ["refreshToken", "idToken", "expiresIn", "scope"] as const) {
      const value = values[key];
      if (value !== undefined) tokens[key] = Array.isArray(value) ? value.join(" ") : value;
    }
    await requestCapability("oauth.tokens.set", { providerId: this.providerId, tokens });
  }

  async getTokens(): Promise<TokenSet | undefined> {
    const value = await requestCapability("oauth.tokens.get", { providerId: this.providerId });
    if (value === null) return undefined;
    const tokens = value as Omit<TokenSet, "isExpired" | "updatedAt"> & { updatedAt: string };
    const updatedAt = new Date(tokens.updatedAt);
    return {
      ...tokens,
      updatedAt,
      isExpired: () =>
        tokens.expiresIn !== undefined &&
        Date.now() >= updatedAt.getTime() + tokens.expiresIn * 1000 - 10000,
    };
  }

  async removeTokens(): Promise<void> {
    await requestCapability("oauth.tokens.remove", { providerId: this.providerId });
  }
}

export const OAuth = { ...enums, clientIdMetadataDocument, PKCEClient };
