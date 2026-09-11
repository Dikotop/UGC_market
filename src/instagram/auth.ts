import { env } from "../config/env.js";
import { graphGet } from "../lib/graphApi.js";

const OAUTH_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"].join(",");

interface AccessTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string;
  permissions?: string[];
}

/** URL to open in a browser to start the manual, one-time OAuth flow (Instagram API with Instagram Login). */
export function buildAuthorizationUrl(): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", env.META_REDIRECT_URI);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/** Exchanges an OAuth `code` for a short-lived (~1h) Instagram user access token. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: env.META_REDIRECT_URI,
    code,
  });

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as ShortLivedTokenResponse & { error_message?: string; error_type?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_message ?? `Failed to exchange authorization code (HTTP ${res.status})`);
  }
  return data.access_token;
}

export interface LongLivedToken {
  accessToken: string;
  expiresAt: Date;
}

function toLongLivedToken(res: AccessTokenResponse): LongLivedToken {
  const expiresInSeconds = res.expires_in ?? 60 * 24 * 60 * 60;
  return {
    accessToken: res.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

/** Exchanges a short-lived Instagram user token for a long-lived one (~60 days). */
export async function exchangeForLongLivedToken(token: string): Promise<LongLivedToken> {
  const res = await graphGet<AccessTokenResponse>("https://graph.instagram.com/access_token", {
    grant_type: "ig_exchange_token",
    client_secret: env.META_APP_SECRET,
    access_token: token,
  });
  return toLongLivedToken(res);
}

/**
 * Refreshes an existing long-lived Instagram user token, extending its
 * validity by another ~60 days. The token must be at least 24h old and not
 * yet expired - an already-expired token can't be refreshed this way and
 * needs a fresh `auth:setup` run instead.
 */
export async function refreshLongLivedToken(token: string): Promise<LongLivedToken> {
  const res = await graphGet<AccessTokenResponse>("https://graph.instagram.com/refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  return toLongLivedToken(res);
}
