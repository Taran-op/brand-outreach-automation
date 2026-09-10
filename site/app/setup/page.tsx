import { auth } from '@/auth';
import { isAllowedEmail } from '@/lib/config';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

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
