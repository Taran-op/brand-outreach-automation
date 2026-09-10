import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAllowedEmail } from '@/lib/config';
import Console from '@/components/Console';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth();
  const email = String(session?.user?.email || '').toLowerCase();

  // The API routes enforce this again; this only avoids rendering a shell that
  // could never load data.
  if (!email || !isAllowedEmail(email)) redirect('/signin');

  return <Console />;
}
