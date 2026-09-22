/**
 * Credentials for unattended runs.
 *
 * Interactive requests act as the signed-in operator. A cron run has no
 * session, so it exchanges a stored refresh token for an access token and
 * acts as the same operator account — no service account, no extra identity
 * with standing access to the mailbox.
 */

export class AutomationNotConfigured extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'AutomationNotConfigured';
  }
}

export async function getAutomationAccessToken(): Promise<string> {
  const refreshToken = process.env.AUTOMATION_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new AutomationNotConfigured(
      'AUTOMATION_REFRESH_TOKEN is not set, so scheduled runs cannot authenticate. Visit /setup while signed in to obtain one.'
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID || '',
      client_secret: process.env.AUTH_GOOGLE_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AutomationNotConfigured(
      `The stored automation refresh token was rejected (${response.status}). ` +
        `Re-issue it from /setup. Google said: ${detail.slice(0, 200)}`
    );
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new AutomationNotConfigured('Google returned no access token.');
  return body.access_token;
}

/**
 * Vercel signs scheduled invocations with CRON_SECRET. Without that check the
 * endpoint would be an unauthenticated way to make the console send mail.
 */
export function assertCronAuthorized(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new AutomationNotConfigured('CRON_SECRET is not set, so scheduled runs are refused.');
  }
  const header = request.headers.get('authorization') || '';
  if (header !== `Bearer ${secret}`) {
    throw Object.assign(new Error('Not authorized.'), { status: 401 });
  }
}
