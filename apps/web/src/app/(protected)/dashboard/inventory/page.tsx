import { redirect } from 'next/navigation';

// Old technical route, kept only as a redirect so existing bookmarks/links
// keep working -- the canonical Inventory route is now `/inventory` (Cafe
// v2.1 QA audit P2-8, 2026-08-17: daily Cafe surfaces should not require the
// `/dashboard` platform shell, matching `/manager`/`/staff`/`/recipes`'s
// existing pattern).
export const dynamic = 'force-dynamic';

export default function LegacyInventoryRedirectPage() {
  redirect('/inventory');
}
