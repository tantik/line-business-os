import { redirect } from 'next/navigation';

// Old technical route, kept only as a redirect so existing bookmarks/links
// keep working -- the canonical Recipe detail route is now `/recipes/[recipeId]`
// (Cafe v2.1 QA audit P2-1, 2026-08-17; see the list page's redirect stub for
// the full rationale).
export const dynamic = 'force-dynamic';

export default async function LegacyRecipeDetailRedirectPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  redirect(`/recipes/${recipeId}`);
}
