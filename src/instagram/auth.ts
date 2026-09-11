import { env } from "../config/env.js";
import { graphGet } from "../lib/graphApi.js";

const OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
].join(",");

interface AccessTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** URL to open in a browser to start the manual, one-time OAuth flow. */
export function buildAuthorizationUrl(): string {
  const url = new URL(`https://www.facebook.com/${env.GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", env.META_REDIRECT_URI);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await graphGet<AccessTokenResponse>("/oauth/access_token", {
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.META_REDIRECT_URI,
    code,
  });
  return res.access_token;
}

export interface LongLivedToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Exchanges a short-lived (or existing, >24h old) token for a long-lived
 * one (~60 days). Used both for the initial exchange after OAuth and for
 * periodic refresh of an already-long-lived token.
 */
export async function exchangeForLongLivedToken(token: string): Promise<LongLivedToken> {
  const res = await graphGet<AccessTokenResponse>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: token,
  });
  const expiresInSeconds = res.expires_in ?? 60 * 24 * 60 * 60;
  return {
    accessToken: res.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}
