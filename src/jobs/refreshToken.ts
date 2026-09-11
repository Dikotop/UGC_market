import { exchangeForLongLivedToken } from "../instagram/auth.js";
import { getAccount, updateToken } from "../repositories/igAccountRepo.js";

const REFRESH_THRESHOLD_DAYS = 10;

export class TokenRefreshError extends Error {}

/**
 * Refreshes the stored long-lived token if it's within REFRESH_THRESHOLD_DAYS
 * of expiring. Throws TokenRefreshError (never silently) if there's no
 * account configured, the token has already expired (needs a fresh
 * `auth:setup` run - a refresh can't recover an expired token), or the
 * refresh call itself fails.
 */
export async function refreshTokenIfNeeded(): Promise<void> {
  const account = await getAccount();
  if (!account) {
    throw new TokenRefreshError("No Instagram account configured. Run `npm run auth:setup` first.");
  }

  const msUntilExpiry = account.tokenExpiresAt.getTime() - Date.now();
  if (msUntilExpiry <= 0) {
    throw new TokenRefreshError(
      "Instagram access token has already expired. Re-run `npm run auth:setup`.",
    );
  }

  const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry > REFRESH_THRESHOLD_DAYS) {
    console.log(`Token still valid for ${daysUntilExpiry.toFixed(1)} days, no refresh needed.`);
    return;
  }

  try {
    const refreshed = await exchangeForLongLivedToken(account.accessToken);
    await updateToken(account.id, refreshed.accessToken, refreshed.expiresAt);
    console.log(`Token refreshed, now valid until ${refreshed.expiresAt.toISOString()}.`);
  } catch (err) {
    throw new TokenRefreshError(
      `Failed to refresh Instagram access token: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
