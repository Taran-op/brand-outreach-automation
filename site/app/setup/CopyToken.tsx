'use client';

import { useState } from 'react';

/**
 * The refresh token is long, shown once, and goes straight into an
 * environment variable — three good reasons not to make the operator select
 * it by hand. The clipboard write can be refused, so the token stays on the
 * page either way and the button says what happened.
 */
export function CopyToken({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setState('copied');
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('failed');
    }
  };

  return (
    <>
      <pre className="setup-token">{token}</pre>
      <div className="signin-actions">
        <button type="button" className="primary" onClick={copy}>
          {state === 'copied' ? 'Copied' : 'Copy token'}
        </button>
      </div>
      {state === 'failed' && (
        <p className="signin-error">
          This browser refused clipboard access — select the token above and copy it by hand.
        </p>
      )}
    </>
  );
}
