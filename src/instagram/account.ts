import { graphGet } from "../lib/graphApi.js";

export interface ResolvedIgAccount {
  igUserId: string;
  igUsername?: string;
}

interface MeResponse {
  user_id: string;
  username?: string;
  account_type?: string;
}

/** Resolves the Instagram account identity behind the given user access token. */
export async function resolveIgBusinessAccount(accessToken: string): Promise<ResolvedIgAccount> {
  const me = await graphGet<MeResponse>("/me", {
    access_token: accessToken,
    fields: "user_id,username,account_type",
  });

  return {
    igUserId: me.user_id,
    igUsername: me.username,
  };
}
