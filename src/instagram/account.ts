import { graphGet } from "../lib/graphApi.js";
import type { AccountsResponse } from "../types/instagram.js";

export interface ResolvedIgAccount {
  igUserId: string;
  igUsername?: string;
  pageId: string;
  pageName: string;
}

/** Resolves the caller's Facebook Pages and finds the one with a linked Instagram Business account. */
export async function resolveIgBusinessAccount(accessToken: string): Promise<ResolvedIgAccount> {
  const accounts = await graphGet<AccountsResponse>("/me/accounts", {
    access_token: accessToken,
    fields: "id,name,instagram_business_account",
  });

  const pageWithIg = accounts.data.find((p) => p.instagram_business_account);
  if (!pageWithIg?.instagram_business_account) {
    throw new Error(
      "No Facebook Page with a linked Instagram Business account was found. " +
        "Link your Instagram account to a Facebook Page you administer, then retry.",
    );
  }

  const igUserId = pageWithIg.instagram_business_account.id;
  const igInfo = await graphGet<{ username?: string }>(`/${igUserId}`, {
    access_token: accessToken,
    fields: "username",
  });

  return {
    igUserId,
    igUsername: igInfo.username,
    pageId: pageWithIg.id,
    pageName: pageWithIg.name,
  };
}
