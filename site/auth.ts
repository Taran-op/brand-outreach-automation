import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from './lib/config';

/**
 * Only what this console actually uses today: sign-in identity and the
 * campaign spreadsheet.
 *
 * The Gmail scopes are deliberately absent. gmail.readonly is a *restricted*
 * scope, which is the strictest tier Google applies and the one most likely to
 * be refused outright on an unverified project. Since nothing here sends mail
 * or reads a mailbox yet, asking for it buys nothing and costs consent
 * friction. Add 'https://www.googleapis.com/auth/gmail.send' back with the
 * send path, and gmail.readonly with reply detection — each will require a
 * one-time re-consent, which is the correct trade.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets'
].join(' ');

/** Exchanges a refresh token for a fresh access token. */
async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID || '',
      client_secret: process.env.AUTH_GOOGLE_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) throw new Error(`Token refresh failed (${response.status}).`);

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

const config: NextAuthConfig = {
  providers: [
    Google({
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: 'offline',
          // Forces Google to return a refresh token on repeat sign-ins.
          prompt: 'consent'
        }
      }
    })
  ],
  session: { strategy: 'jwt' },
  // Verbose Auth.js output in the Vercel function logs while sign-in is being
  // brought up. Turn this off once the flow is stable — it logs OAuth detail.
  debug: process.env.AUTH_DEBUG === 'true',
  callbacks: {
    /**
     * The server-side allowlist is the authorization boundary, exactly as
     * assertUiOwner_ is in the Apps Script project. It is repeated on every
     * API route; this callback only stops an unauthorized session existing.
     */
    signIn({ profile }) {
      const email = String(profile?.email || '').toLowerCase();
      if (!email || profile?.email_verified === false) return false;
      return isAllowedEmail(email);
    },

    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? token.refreshToken,
          expiresAt: account.expires_at ? account.expires_at * 1000 : 0
        };
      }

      const expiresAt = Number(token.expiresAt || 0);
      // Refresh a minute early so an in-flight request does not race expiry.
      if (expiresAt && Date.now() < expiresAt - 60_000) return token;
      if (!token.refreshToken) return { ...token, error: 'NoRefreshToken' };

      try {
        const refreshed = await refreshAccessToken(String(token.refreshToken));
        return {
          ...token,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? token.refreshToken,
          expiresAt: Date.now() + refreshed.expires_in * 1000,
          error: undefined
        };
      } catch {
        return { ...token, error: 'RefreshFailed' };
      }
    },

    session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      return session;
    }
  },
  pages: { signIn: '/signin', error: '/signin' }
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
