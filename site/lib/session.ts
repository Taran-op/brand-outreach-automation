import { auth } from '@/auth';
import { isAllowedEmail, isMailboxOwner, mailboxOwner } from './config';

export type Operator = {
  email: string;
  accessToken: string;
};

export class AuthorizationError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

/**
 * Repeats the allowlist check on every request rather than trusting that a
 * session exists, matching assertUiOwner_ in the Apps Script project. A
 * session issued before the allowlist changed must stop working immediately.
 */
export async function requireOperator(): Promise<Operator> {
  const session = await auth();
  const email = String(session?.user?.email || '').toLowerCase();

  if (!email) throw new AuthorizationError('Sign in with the operator Google account.');
  if (!isAllowedEmail(email)) {
    throw new AuthorizationError(`${email} is not authorized to use this console.`, 403);
  }
  if (session?.error) {
    throw new AuthorizationError('Google access expired. Sign out and back in.', 401);
  }
  if (!session?.accessToken) {
    throw new AuthorizationError('No Google access token on this session. Sign in again.', 401);
  }

  return { email, accessToken: session.accessToken };
}

/**
 * For operations that touch the campaign mailbox. Lead management is open to
 * every allowlisted operator; sending and reply scanning are not, because they
 * only make sense from the mailbox that holds the threads.
 */
export async function requireMailboxOwner(): Promise<Operator> {
  const operator = await requireOperator();
  if (!isMailboxOwner(operator.email)) {
    throw new AuthorizationError(
      `Mail operations run from the campaign mailbox (${mailboxOwner()}). ` +
        `You are signed in as ${operator.email}, so you can manage leads but not send or scan replies.`,
      403
    );
  }
  return operator;
}

export function errorResponse(error: unknown): Response {
  const status =
    error instanceof AuthorizationError
      ? error.status
      : typeof (error as { status?: number })?.status === 'number'
        ? (error as { status: number }).status
        : 500;
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return Response.json({ error: message }, { status });
}
