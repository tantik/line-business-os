import { redirect } from 'next/navigation';

// Old technical route, kept only as a redirect so existing bookmarks/links
// keep working -- the canonical Recipes route is now `/recipes` (Cafe v2.1
// QA audit P2-1, 2026-08-17: `/dashboard/workforce/recipes` was the only
// working path and the short `/recipes` URL 404'd; this reverses that -- the
// short route is now canonical, matching `/manager`/`/staff`'s existing
// pattern, PR #246).
export const dynamic = 'force-dynamic';

export default function LegacyRecipesRedirectPage() {
  redirect('/recipes');
}
