import type { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { getWorkforceRecipeDetail } from '@/lib/workforce/recipes';
import {
  PreviewErrorState,
  PreviewModuleUnavailableState,
  PreviewNoAccessState,
  PreviewNotFoundState,
} from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', ...mutedText }}>{children}</p>;
}

/**
 * Mame To Cha preview recipe detail (Phase 1N-4C Slice B1) - read-only, same
 * data loader as the dashboard recipe detail page. A recipe id that does not
 * exist, belongs to another tenant, or is filtered out by RLS all render the
 * same neutral not-found state (indistinguishable at the query layer).
 */
export default async function MameToChaPreviewRecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  await requirePreviewUser(`${PREVIEW_BASE_PATH}/recipes/${recipeId}`);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState variant="light" />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState variant="light" />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState variant="light" />;

  const detailResult = await getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipeId);
  if (detailResult.status !== 'success') return <PreviewErrorState variant="light" />;
  if (detailResult.data === null) return <PreviewNotFoundState variant="light" />;

  const { recipe, ingredients, steps, notes } = detailResult.data;

  return (
    <main style={pageStyle(720)}>
      <Link
        href={`${PREVIEW_BASE_PATH}/recipes`}
        style={{ ...linkAccent, display: 'inline-block', fontSize: 14, textDecoration: 'underline' }}
      >
        レシピ一覧に戻る
      </Link>
      <header style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ margin: 0 }}>{recipe.titleJa || recipe.titleEn || recipe.recipeId}</h1>
          {recipe.contentKind === 'instruction' ? (
            <span style={badgeStyle('neutral')}>ⓘ インストラクション</span>
          ) : null}
        </div>
        {recipe.descriptionJa || recipe.descriptionEn ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{recipe.descriptionJa || recipe.descriptionEn}</p>
        ) : null}
      </header>

      {recipe.contentKind === 'recipe' ? <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>材料</h2>
        {ingredients.length === 0 ? (
          <EmptyStateText>材料の記載はありません。</EmptyStateText>
        ) : (
          <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            {ingredients.map((ingredient) => (
              <li key={ingredient.ingredientId}>{ingredient.labelJa || ingredient.labelEn}</li>
            ))}
          </ul>
        )}
      </section> : null}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>手順</h2>
        {steps.length === 0 ? (
          <EmptyStateText>手順の記載はありません。</EmptyStateText>
        ) : (
          <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            {steps.map((step) => (
              <li key={step.stepId}>{step.instructionJa || step.instructionEn}</li>
            ))}
          </ol>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>メモ</h2>
        {notes.length === 0 ? (
          <EmptyStateText>メモはありません。</EmptyStateText>
        ) : (
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
            {notes.map((note) => (
              <li key={note.noteId} style={{ marginTop: 8 }}>
                <strong>{note.titleJa || note.titleEn}</strong>
                <p style={{ margin: '4px 0 0' }}>{note.bodyJa || note.bodyEn}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
