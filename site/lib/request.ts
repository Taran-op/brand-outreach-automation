/**
 * The console posts calls as { args: [...] }, mirroring the positional shape
 * google.script.run used, so the client stayed a thin transport swap.
 */
export async function readArgs(request: Request): Promise<unknown[]> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error('Expected a JSON body.');
  }
  const args = (body as { args?: unknown })?.args;
  if (!Array.isArray(args)) throw new Error('Expected an args array.');
  return args;
}

/** Apps Script used Utilities.getUuid(); crypto.randomUUID is the equivalent. */
export const newLeadId = (): string => crypto.randomUUID();
