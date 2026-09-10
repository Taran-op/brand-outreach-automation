import { auth, signIn, signOut } from '@/auth';
import { isAllowedEmail } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Auth.js error codes, translated into what to actually go and fix. */
const ERROR_HELP: Record<string, string> = {
  AccessDenied:
    'Google refused the account. Add it under Google Auth Platform → Audience → Test users, in the project that owns this OAuth client.',
  Configuration:
    'The server rejected its own config — usually a wrong AUTH_GOOGLE_SECRET, or a secret that does not belong to this client ID.',
  OAuthSignin: 'Could not start the Google handshake. Check AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.',
  OAuthCallbackError:
    'Google sent back an error. Most often the redirect URI is not registered on this OAuth client, or the client secret is wrong.',
  OAuthCallback: 'The token exchange with Google failed. Check the client secret.',
  OAuthAccountNotLinked: 'This Google account is already linked to a different sign-in method.',
  Verification: 'The sign-in link expired. Try again.',
  CredentialsSignin: 'Sign-in was rejected.'
};

export default async function SignIn({
  searchParams
}: {
  searchParams: Promise<{ error?: string; error_description?: string; code?: string }>;
}) {
  const { error, error_description: errorDescription, code } = await searchParams;
  const session = await auth();
  const email = String(session?.user?.email || '').toLowerCase();
  const authorized = isAllowedEmail(email);

  return (
    <main className="signin">
      <div className="signin-card">
        <span className="eyebrow">Private operator console</span>
        <h1>Brand Outreach Console</h1>

        {error && (
          <div className="signin-error">
            <p>
              <strong>Sign-in failed: {error}</strong>
            </p>
            <p>{ERROR_HELP[error] || 'Google did not complete the handshake.'}</p>
            {errorDescription && <p>Google said: {errorDescription}</p>}
            {code && <p>Code: {code}</p>}
            <p className="signin-hint">
              Quote this whole box when asking for help — the code above is what identifies the
              cause.
            </p>
          </div>
        )}

        {email && !authorized && (
          <p className="signin-error">
            Signed in as <strong>{email}</strong>, which is not authorized. Sign out and use the
            operator account.
          </p>
        )}

        <p>
          Access is limited to the operator Google account. The console reads the campaign
          spreadsheet as you — it holds no credentials of its own.
        </p>

        <div className="signin-actions">
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/' });
            }}
          >
            <button type="submit" className="primary">
              {email ? 'Sign in with a different account' : 'Continue with Google'}
            </button>
          </form>

          {email && (
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/signin' });
              }}
            >
              <button type="submit" className="secondary">
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
