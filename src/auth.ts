import NextAuth from "next-auth";
import Okta from "next-auth/providers/okta";
import authConfig from "@/auth.config";

const OKTA_SCOPES = "openid profile email offline_access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Okta({
      authorization: { params: { scope: OKTA_SCOPES } },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
        return token;
      }

      if (!token.refreshToken) {
        return { ...token, error: "NoRefreshToken" as const };
      }

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
              client_secret: process.env.AUTH_OKTA_SECRET!,
              scope: OKTA_SCOPES,
            }),
          },
        );
        const refreshed = await res.json();
        if (!res.ok) throw refreshed;

        return {
          ...token,
          accessToken: refreshed.access_token as string,
          expiresAt: Math.floor(Date.now() / 1000) + (refreshed.expires_in as number),
          refreshToken: (refreshed.refresh_token as string | undefined) ?? token.refreshToken,
          error: undefined,
        };
      } catch {
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
