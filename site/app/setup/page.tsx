import { auth, GOOGLE_SCOPES } from '@/auth';
import { isAllowedEmail } from '@/lib/config';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Asks Google which scopes the current token actually carries. Requesting a
 * scope and being granted it are different things, and the difference is
 * otherwise invisible until an API call fails.
 */
async function grantedScopes(accessToken?: string): Promise<string[] | null> {
  if (!accessToken) return null;
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { scope?: string };
    return String(body.scope || '').split(' ').filter(Boolean);
  } catch {
    return null;
  }
}

const shortScope = (scope: string) => scope.replace('https://www.googleapis.com/auth/', '');

/**
 * One-time setup for unattended runs.
 *
 * A scheduled run has no session, so it needs a stored refresh token. This
 * page shows the operator their own token so they can put it into Vercel
 * themselves — it is never written to the spreadsheet, never logged, and never
 * passes through anyone else's hands.
 */
export default async function Setup() {
  const session = await auth();
  const email = String(session?.user?.email || '').toLowerCase();
  if (!isAllowedEmail(email)) redirect('/signin');

  const configured = Boolean(process.env.AUTOMATION_REFRESH_TOKEN);
  const cronSecretSet = Boolean(process.env.CRON_SECRET);

  const granted = await grantedScopes(session?.accessToken);
  const requested = GOOGLE_SCOPES.split(' ');
  const missing = granted ? requested.filter((scope) => !granted.includes(scope)) : [];

  return (
    <main className="signin">
      <div className="signin-card setup-card">
        <span className="eyebrow">Scheduled runs</span>
        <h1>Automation setup</h1>

        <p>
          Scheduled runs act as <strong>{email}</strong>. They need a refresh token stored in Vercel,
          because a cron invocation has no browser session to borrow.
        </p>

        <ol className="setup-steps">
          <li>
            Sign out and sign in again. Google only returns a refresh token on a fresh consent, so a
            long-lived session will not have one to show.
          </li>
          <li>
            Copy the token below and store it as <code>AUTOMATION_REFRESH_TOKEN</code> in Vercel.
            Treat it like a password: it grants mailbox and spreadsheet access until revoked.
          </li>
          <li>
            Set <code>CRON_SECRET</code> to any long random string. Without it the scheduled endpoint
            refuses to run at all.
          </li>
        </ol>

        <div className="setup-status">
          <p>
            AUTOMATION_REFRESH_TOKEN: <strong>{configured ? 'stored' : 'not set'}</strong>
          </p>
          <p>
            CRON_SECRET: <strong>{cronSecretSet ? 'set' : 'not set'}</strong>
          </p>
        </div>

        <h2 className="setup-heading">Scopes this session actually holds</h2>
        {granted === null ? (
          <p className="signin-error">
            Google would not describe this token. Sign out and back in.
          </p>
        ) : (
          <>
            <ul className="setup-scopes">
              {requested.map((scope) => (
                <li key={scope} className={granted.includes(scope) ? 'granted' : 'missing'}>
                  {granted.includes(scope) ? '✓' : '✗'} {shortScope(scope)}
                </li>
              ))}
            </ul>
            {missing.length > 0 && (
              <p className="signin-error">
                Google granted less than the app asked for. Add these scopes to the OAuth consent
                screen under <strong>Google Auth Platform → Data Access</strong>, save, then sign out
                and back in. Google only issues scopes registered there.
              </p>
            )}
          </>
        )}

        {session?.refreshToken ? (
          <>
            <p className="signin-hint">Your refresh token — copy it now, it is not shown again:</p>
            <pre className="setup-token">{session.refreshToken}</pre>
          </>
        ) : (
          <p className="signin-error">
            This session carries no refresh token. Sign out, then sign in again to get one.
          </p>
        )}

        <p className="signin-hint">
          You can revoke it at any time from your Google Account under Security → Third-party access.
          Scheduled runs stop; nothing else breaks.
        </p>

        <div className="signin-actions">
          <form action="/">
            <button type="submit" className="secondary">
              Back to console
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
