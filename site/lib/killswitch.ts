/**
 * Runtime kill switch.
 *
 * Apps Script kept this in a script property. This console has no state of its
 * own, so the flag lives in a dedicated one-cell tab in the campaign
 * spreadsheet: durable, visible to a human, and editable by hand if the
 * console itself is unreachable.
 */

import { spreadsheetId } from './config';
import { SheetsError } from './sheets';
import { safeDisplayText } from './text';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const CONTROL_SHEET = 'Console Control';
const FLAG_CELL = 'B1';
const LABEL_CELL = 'A1';

async function api<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  const response = await fetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId())}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new SheetsError(
      `Kill-switch access failed (${response.status}): ${safeDisplayText(detail).slice(0, 200)}`,
      response.status
    );
  }
  return (await response.json()) as T;
}

async function ensureControlSheet(accessToken: string): Promise<void> {
  const meta = await api<{ sheets?: { properties?: { title?: string } }[] }>(
    '?fields=sheets.properties.title',
    { method: 'GET' },
    accessToken
  );
  const exists = (meta.sheets || []).some((sheet) => sheet.properties?.title === CONTROL_SHEET);
  if (exists) return;

  await api(
    ':batchUpdate',
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: CONTROL_SHEET, hidden: true } } }]
      })
    },
    accessToken
  );
  await api(
    `/values/${encodeURIComponent(`'${CONTROL_SHEET}'!${LABEL_CELL}:${FLAG_CELL}`)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [['Sending disabled by operator?', 'NO']] })
    },
    accessToken
  );
}

/** True when an operator has pressed Emergency disable. Fails closed. */
export async function isSystemDisabled(accessToken: string): Promise<boolean> {
  try {
    const range = `'${CONTROL_SHEET}'!${FLAG_CELL}`;
    const body = await api<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(range)}`,
      { method: 'GET' },
      accessToken
    );
    const value = safeDisplayText(body.values?.[0]?.[0]).toUpperCase();
    return value === 'YES' || value === 'TRUE' || value === 'DISABLED';
  } catch (error) {
    // A missing control tab means nobody has ever disabled anything.
    if (error instanceof SheetsError && error.status === 400) return false;
    throw error;
  }
}

export async function setSystemDisabled(accessToken: string, disabled: boolean): Promise<void> {
  await ensureControlSheet(accessToken);
  await api(
    `/values/${encodeURIComponent(`'${CONTROL_SHEET}'!${FLAG_CELL}`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [[disabled ? 'YES' : 'NO']] }) },
    accessToken
  );
}

/**
 * Second row of the control tab: when reply routing was last proven to work
 * end to end. An MX record alone cannot show that a Hostinger mailbox forwards
 * into Gmail, so this is written only by a successful loopback test.
 */
const ROUTING_LABEL_CELL = 'A2';
const ROUTING_VALUE_CELL = 'B2';

export async function getRoutingVerifiedAt(accessToken: string): Promise<Date | null> {
  try {
    const body = await api<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(`'${CONTROL_SHEET}'!${ROUTING_VALUE_CELL}`)}`,
      { method: 'GET' },
      accessToken
    );
    const raw = safeDisplayText(body.values?.[0]?.[0]);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    if (error instanceof SheetsError && error.status === 400) return null;
    throw error;
  }
}

export async function setRoutingVerifiedAt(accessToken: string, when: Date): Promise<void> {
  await ensureControlSheet(accessToken);
  await api(
    `/values/${encodeURIComponent(`'${CONTROL_SHEET}'!${ROUTING_LABEL_CELL}:${ROUTING_VALUE_CELL}`)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [['Reply routing last verified', when.toISOString()]] })
    },
    accessToken
  );
}
