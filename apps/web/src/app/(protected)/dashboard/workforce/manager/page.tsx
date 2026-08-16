import { redirect } from 'next/navigation';

// Old technical route, kept only as a redirect so existing bookmarks/links
// keep working -- the canonical Manager route is now `/manager`.
export const dynamic = 'force-dynamic';

export default async function LegacyManagerRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/manager?${query}` : '/manager');
}
