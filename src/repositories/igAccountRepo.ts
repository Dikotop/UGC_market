import { pool } from "../db/pool.js";
import { decrypt, encrypt } from "../lib/crypto.js";

export interface IgAccount {
  id: number;
  igUserId: string;
  igUsername: string | null;
  pageId: string | null;
  pageName: string | null;
  accessToken: string;
  tokenExpiresAt: Date;
}

interface IgAccountRow {
  id: number;
  ig_user_id: string;
  ig_username: string | null;
  page_id: string | null;
  page_name: string | null;
  access_token_encrypted: string;
  token_expires_at: Date;
}

function toDomain(row: IgAccountRow): IgAccount {
  return {
    id: row.id,
    igUserId: row.ig_user_id,
    igUsername: row.ig_username,
    pageId: row.page_id,
    pageName: row.page_name,
    accessToken: decrypt(row.access_token_encrypted),
    tokenExpiresAt: row.token_expires_at,
  };
}

export async function upsertAccount(params: {
  igUserId: string;
  igUsername?: string;
  pageId: string;
  pageName: string;
  accessToken: string;
  tokenExpiresAt: Date;
}): Promise<IgAccount> {
  const { rows } = await pool.query<IgAccountRow>(
    `INSERT INTO ig_accounts (ig_user_id, ig_username, page_id, page_name, access_token_encrypted, token_expires_at, long_lived_token_obtained_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (ig_user_id) DO UPDATE SET
       ig_username = EXCLUDED.ig_username,
       page_id = EXCLUDED.page_id,
       page_name = EXCLUDED.page_name,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       long_lived_token_obtained_at = now(),
       updated_at = now()
     RETURNING *`,
    [
      params.igUserId,
      params.igUsername ?? null,
      params.pageId,
      params.pageName,
      encrypt(params.accessToken),
      params.tokenExpiresAt,
    ],
  );
  return toDomain(rows[0]);
}

/** This project tracks a single personal account, so this returns that one row (if set up). */
export async function getAccount(): Promise<IgAccount | null> {
  const { rows } = await pool.query<IgAccountRow>("SELECT * FROM ig_accounts ORDER BY id LIMIT 1");
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function updateToken(id: number, accessToken: string, tokenExpiresAt: Date): Promise<void> {
  await pool.query(
    `UPDATE ig_accounts
     SET access_token_encrypted = $1, token_expires_at = $2, long_lived_token_obtained_at = now(), updated_at = now()
     WHERE id = $3`,
    [encrypt(accessToken), tokenExpiresAt, id],
  );
}
