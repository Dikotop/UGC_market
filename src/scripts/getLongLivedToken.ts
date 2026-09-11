import http from "node:http";
import { URL } from "node:url";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { resolveIgBusinessAccount } from "../instagram/account.js";
import { buildAuthorizationUrl, exchangeCodeForToken, exchangeForLongLivedToken } from "../instagram/auth.js";
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
  // Fallback path: paste a short-lived token obtained manually (e.g. via
  // Graph API Explorer) if the local-listener OAuth flow isn't viable.
  const tokenArg = process.argv.find((a) => a.startsWith("--token="));
  let shortLivedToken: string;

  if (tokenArg) {
    shortLivedToken = tokenArg.slice("--token=".length);
    console.log("Using provided short-lived token from --token=...");
  } else {
    const code = await waitForAuthorizationCode();
    console.log("Authorization code received, exchanging for access token...");
    shortLivedToken = await exchangeCodeForToken(code);
  }

  console.log("Exchanging for a long-lived token...");
  const longLived = await exchangeForLongLivedToken(shortLivedToken);

  console.log("Resolving linked Instagram Business account...");
  const resolved = await resolveIgBusinessAccount(longLived.accessToken);

  await upsertAccount({
    igUserId: resolved.igUserId,
    igUsername: resolved.igUsername,
    pageId: resolved.pageId,
    pageName: resolved.pageName,
    accessToken: longLived.accessToken,
    tokenExpiresAt: longLived.expiresAt,
  });

  console.log(`\nDone. Connected @${resolved.igUsername ?? resolved.igUserId} (via Page "${resolved.pageName}").`);
  console.log(`Token valid until ${longLived.expiresAt.toISOString()}.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("ALERT: auth setup failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return pool.end();
  });
