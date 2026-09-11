import http from "node:http";
import { URL } from "node:url";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { resolveIgBusinessAccount } from "../instagram/account.js";
import { buildAuthorizationUrl, ensureLongLivedToken, exchangeCodeForToken } from "../instagram/auth.js";
import { upsertAccount } from "../repositories/igAccountRepo.js";

function waitForAuthorizationCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const redirectUrl = new URL(env.META_REDIRECT_URI);
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== redirectUrl.pathname) {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        error
          ? `<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`
          : `<h1>Authorization received</h1><p>You can close this tab and return to the terminal.</p>`,
      );

      server.close();
      if (error) reject(new Error(`OAuth authorization failed: ${error}`));
      else if (code) resolve(code);
      else reject(new Error("OAuth callback did not include a code or error."));
    });

    server.listen(redirectUrl.port ? Number(redirectUrl.port) : 80, () => {
      console.log("\nOpen this URL in your browser and authorize the app:\n");
      console.log(buildAuthorizationUrl());
      console.log(`\nWaiting for the redirect back to ${env.META_REDIRECT_URI} ...\n`);
    });

    server.on("error", reject);
  });
}

async function main(): Promise<void> {
  // Fallback path: paste a token obtained manually (App Dashboard > API setup
  // with Instagram login > Generate token) if the local-listener OAuth flow
  // isn't viable.
  const tokenArg = process.argv.find((a) => a.startsWith("--token="));
  let token: string;

  if (tokenArg) {
    token = tokenArg.slice("--token=".length);
    console.log("Using provided token from --token=...");
  } else {
    const code = await waitForAuthorizationCode();
    console.log("Authorization code received, exchanging for access token...");
    token = await exchangeCodeForToken(code);
  }

  console.log("Obtaining a long-lived token...");
  const longLived = await ensureLongLivedToken(token);

  console.log("Resolving linked Instagram Business account...");
  const resolved = await resolveIgBusinessAccount(longLived.accessToken);

  await upsertAccount({
    igUserId: resolved.igUserId,
    igUsername: resolved.igUsername,
    accessToken: longLived.accessToken,
    tokenExpiresAt: longLived.expiresAt,
  });

  console.log(`\nDone. Connected @${resolved.igUsername ?? resolved.igUserId}.`);
  console.log(`Token valid until ${longLived.expiresAt.toISOString()}.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("ALERT: auth setup failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return pool.end();
  });
