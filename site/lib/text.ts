/**
 * Faithful ports of the sanitizers and validators from src/02_Utils.gs and
 * src/10_WebApp.gs. Behaviour must not drift: the Apps Script deployment and
 * this console write to the same Sheet, and the send gates depend on these
 * exact rules.
 */

export const normalizeEmail = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

export const truncate = (value: unknown, maxLength: number): string => {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)) + '…';
};

export const safeDisplayText = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Neutralizes a leading =, +, - or @ so a cell can never become a formula. */
export const safeSheetText = (value: unknown): string => {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

export const sanitizeUiText = (value: unknown, maxLength: number): string =>
  truncate(safeDisplayText(value), maxLength);

export const sanitizeUiMultilineText = (value: unknown, maxLength: number): string =>
  truncate(
    String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
    maxLength
  );

export const isValidSingleEmail = (value: unknown): boolean => {
  const email = normalizeEmail(value);
  if (!email || email.length > 254) return false;
  if (/[\r\n,;\s]/.test(email)) return false;
  if ((email.match(/@/g) || []).length !== 1) return false;

  const [local, domain] = email.split('@');
  if (!local || local.length > 64 || !domain || domain.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/i.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/i.test(tld) || /^xn--[a-z0-9-]+$/i.test(tld);
};

export const isTrue = (value: unknown): boolean =>
  value === true || String(value ?? '').trim().toUpperCase() === 'TRUE';

/** Status comparison is deliberately exact — no trimming, no case folding. */
export const isExactStatus = (value: unknown, expected: string): boolean =>
  value === expected;
