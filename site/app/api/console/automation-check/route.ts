import { GOOGLE_SCOPES } from '@/auth';
import { getAutomationAccessToken } from '@/lib/automation';
import { errorResponse, requireMailboxOwner } from '@/lib/session';
import { safeDisplayText } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Proves the scheduled run can authenticate, without running it.
 *
 * The stored refresh token is write-only once it is in the host's settings:
 * nobody can read it back to check it was pasted whole, and the alternative
 * way to find out is to wait for 10:00 IST and read the log. So this
 * exchanges it for an access token exactly as the scheduled run does, asks
 * Google whose it is and what it may do, and sends nothing.
 */
export async function POST() {
  try {
    await requireMailboxOwner();

    const accessToken = await getAutomationAccessToken();
    const info = (await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { cache: 'no-store' }
    ).then((response) => (response.ok ? response.json() : {}))) as { scope?: string; email?: string };

    const granted = new Set(String(info.scope || '').split(/\s+/).filter(Boolean));
    // GOOGLE_SCOPES is the space-separated string Auth.js asks Google for.
    const missing = GOOGLE_SCOPES.split(/\s+/).filter((scope) => scope && !granted.has(scope));
    const account = safeDisplayText(info.email);
    const cronConfigured = Boolean(process.env.CRON_SECRET);

    return Response.json({
      ok: missing.length === 0 && cronConfigured,
      account,
      missing,
      cronConfigured,
      message:
        `Google accepted the stored token${account ? `, which acts as ${account}` : ''}. ` +
        (missing.length
          ? `It is missing ${missing.length} scope(s) the run needs: ${missing.join(', ')}. Re-issue the token from /setup after granting them.`
          : 'It holds every scope the scheduled run needs.') +
        (cronConfigured ? '' : ' CRON_SECRET is not set, so scheduled invocations are still refused.')
    });
  } catch (error) {
    return errorResponse(error);
  }
}
