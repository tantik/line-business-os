import { redirect } from 'next/navigation';

// Old technical route, kept only as a redirect so existing bookmarks/links
// keep working -- the canonical Staff route is now `/staff`.
export const dynamic = 'force-dynamic';

export default async function LegacyStaffRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/staff?${query}` : '/staff');
}
