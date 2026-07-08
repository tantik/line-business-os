import type { ReactNode } from 'react';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { getWorkforceRecipeDetail } from '@/lib/workforce/recipes';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  NotFoundState,
  UnauthorizedState,
} from '@/components/states';
import { card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', ...mutedText }}>{children}</p>;
}

/**
 * Recipe detail (ingredients, steps, notes). Reachable only when the
 * tenant's `workforce` module is enabled (app-level entitlement check, not
 * the security boundary -- see `dashboard/workforce/page.tsx`). Recipe
 * views are not queried at all when the module is disabled. A recipe id
 * that does not exist, belongs to another tenant, or is filtered out by RLS
 * all render the same neutral `NotFoundState` -- these are indistinguishable
 * at the query layer.
 */
export default async function WorkforceRecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const modulesResult = await listTenantModules(supabase);
      const workforceEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) =>
            module.tenantId === activeTenant.tenantId &&
            module.module === 'workforce' &&
            module.isEnabled,
        );

      if (!workforceEnabled) return <ModuleUnavailableState />;

      const detailResult = await getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipeId);

      if (detailResult.status === 'unauthorized') return <UnauthorizedState />;
      if (detailResult.status !== 'success') return <ErrorState />;
      if (detailResult.data === null) return <NotFoundState />;

      const { recipe, ingredients, steps, notes } = detailResult.data;

      return (
        <main style={pageStyle(720)}>
          <Link
            href="/dashboard/workforce/recipes"
            style={{ ...linkAccent, display: 'inline-block', fontSize: 14, textDecoration: 'underline' }}
          >
            Back to recipes
          </Link>
          <header style={{ marginTop: 12 }}>
            <h1 style={{ margin: 0 }}>{recipe.titleJa || recipe.titleEn || recipe.recipeId}</h1>
            {recipe.descriptionJa || recipe.descriptionEn ? (
              <p style={{ margin: '8px 0 0', ...mutedText }}>{recipe.descriptionJa || recipe.descriptionEn}</p>
            ) : null}
          </header>

          <section style={card}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Ingredients</h2>
            {ingredients.length === 0 ? (
              <EmptyStateText>No ingredients listed.</EmptyStateText>
            ) : (
              <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
                {ingredients.map((ingredient) => (
                  <li key={ingredient.ingredientId}>{ingredient.labelJa || ingredient.labelEn}</li>
                ))}
              </ul>
            )}
          </section>

          <section style={card}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Steps</h2>
            {steps.length === 0 ? (
              <EmptyStateText>No steps listed.</EmptyStateText>
            ) : (
              <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
                {steps.map((step) => (
                  <li key={step.stepId}>{step.instructionJa || step.instructionEn}</li>
                ))}
              </ol>
            )}
          </section>

          <section style={card}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Notes</h2>
            {notes.length === 0 ? (
              <EmptyStateText>No notes.</EmptyStateText>
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
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    // `not_authenticated` is already redirected to sign-in by requireTenantContext.
    default:
      return <ErrorState />;
  }
}
