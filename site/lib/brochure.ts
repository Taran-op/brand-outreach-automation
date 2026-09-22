/**
 * The overview graphic embedded in the initial email.
 *
 * Delivered as a multipart/related part referenced by Content-ID rather than a
 * remote <img src="https://...">, because Outlook and many clients block
 * remote images by default — a hosted URL would leave a blank box for a
 * meaningful share of recipients. A data: URI is not an option either; Gmail
 * strips those outright.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { InlineImage } from './gmail';

export const BROCHURE_CONTENT_ID = 'asaiverse-overview';

const CANDIDATES = [
  { file: 'asaiverse-overview.jpg', mimeType: 'image/jpeg' },
  { file: 'asaiverse-overview.jpeg', mimeType: 'image/jpeg' },
  { file: 'asaiverse-overview.png', mimeType: 'image/png' }
];

/** Beyond this an image starts to hurt deliverability more than it helps. */
const MAX_BYTES = 1_500_000;

let cached: InlineImage | null | undefined;

/**
 * Returns the graphic, or null when none is installed. A missing file must
 * never stop an email going out — the copy stands on its own.
 */
export async function loadBrochure(): Promise<InlineImage | null> {
  if (cached !== undefined) return cached;

  for (const candidate of CANDIDATES) {
    try {
      const bytes = await readFile(path.join(process.cwd(), 'public', 'email', candidate.file));
      if (bytes.byteLength > MAX_BYTES) {
        console.warn(
          `Skipping ${candidate.file}: ${Math.round(bytes.byteLength / 1024)} KB exceeds the ${
            MAX_BYTES / 1024
          } KB inline-image budget.`
        );
        continue;
      }
      cached = {
        contentId: BROCHURE_CONTENT_ID,
        fileName: candidate.file,
        mimeType: candidate.mimeType,
        bytes
      };
      return cached;
    } catch {
      // Try the next extension.
    }
  }

  cached = null;
  return cached;
}
