import NextAuth from "next-auth";
import Okta from "next-auth/providers/okta";
import authConfig from "@/auth.config";

const OKTA_SCOPES = "openid profile email offline_access";

// Optional debug knobs. Leave both env vars unset in production.
//   NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS  — override access-token lifetime
//   AUTH_DEBUG_LOG_TOKENS               — log fingerprints on sign-in/refresh
const DEBUG_TTL_SECONDS =
  Number(process.env.NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS) || undefined;
const LOG_TOKENS = process.env.AUTH_DEBUG_LOG_TOKENS === "true";

const fp = (t?: string | null) =>
  t ? `${t.slice(0, 8)}…${t.slice(-8)}` : "(none)";
const log = (...args: unknown[]) => {
  if (LOG_TOKENS) console.log("[auth]", ...args);
};

function expiresAtFrom(oktaExpiresInSeconds: number | undefined) {
  const ttl = DEBUG_TTL_SECONDS ?? oktaExpiresInSeconds;
  return ttl ? Math.floor(Date.now() / 1000) + ttl : undefined;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Okta({
      authorization: { params: { scope: OKTA_SCOPES } },
      // Public OIDC client — no client secret. Auth.js still sends a PKCE
      // challenge (via the default provider `checks: ["pkce", "state"]`).
      client: { token_endpoint_auth_method: "none" },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account }) {
      if (account) {
        // Real config guard: without a refresh_token, the session dies when the
        // access token expires. Means the Okta app is misconfigured (missing
        // Refresh Token grant type, or offline_access not granted).
        if (!account.refresh_token) {
          throw new Error(
            "[auth] Okta did not return a refresh_token. Check the app's grant types (Refresh Token enabled) and that `offline_access` appears in the granted scope.",
          );
        }
        log(
          "initial sign-in — access:",
          fp(account.access_token),
          "refresh:",
          fp(account.refresh_token),
        );
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt:
            DEBUG_TTL_SECONDS !== undefined
              ? Math.floor(Date.now() / 1000) + DEBUG_TTL_SECONDS
              : account.expires_at,
        };
      }

      if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
        return token;
      }

      if (!token.refreshToken) {
        return { ...token, error: "NoRefreshToken" as const };
      }

      log("refreshing — old access:", fp(token.accessToken));
      try {
        const res = await fetch(
          `${process.env.AUTH_OKTA_ISSUER}/oauth2/v1/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: token.refreshToken,
              client_id: process.env.AUTH_OKTA_ID!,
              scope: OKTA_SCOPES,
            }),
          },
        );
        const refreshed = await res.json();
        if (!res.ok) throw refreshed;

        log("refreshed — new access: ", fp(refreshed.access_token));
        return {
          ...token,
          accessToken: refreshed.access_token as string,
          expiresAt: expiresAtFrom(refreshed.expires_in as number | undefined),
          refreshToken:
            (refreshed.refresh_token as string | undefined) ?? token.refreshToken,
          error: undefined,
        };
      } catch (e) {
        console.error("[auth] token refresh failed:", e);
        return { ...token, error: "RefreshAccessTokenError" as const };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});
