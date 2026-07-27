import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { PreviewErrorState, PreviewModuleUnavailableState, PreviewNoAccessState } from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { card, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * Mame To Cha preview root (Phase 1N-4C Slice B1). Reachable at the public
 * path `/mame-to-cha` only on the `preview.oruwa.jp` host (via the
 * `next.config.mjs` rewrite); this file is the internal rewrite destination
 * and must never be linked to directly.
 */
export default async function MameToChaPreviewRootPage() {
  await requirePreviewUser(PREVIEW_BASE_PATH);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status === 'not_authenticated') {
    // requirePreviewUser already guarantees a session by this point; treat as no-access defensively.
    return <PreviewNoAccessState />;
  }
  if (tenantResult.status !== 'success') return <PreviewNoAccessState />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();
  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState />;

  const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);

  return (
    <main style={pageStyle(720)}>
      <header>
        <h1 style={{ margin: 0 }}>Mame To Cha プレビュー</h1>
        <p style={{ margin: '8px 0 0', ...mutedText }}>カフェ運営に必要なスタッフ、シフト、勤務報告、レシピを確認できます。</p>
      </header>

      {profileResult.status === 'success' && profileResult.data ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 16 }}>マイスタッフ情報</h2>
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            {profileResult.data.positionLabel ?? '役職未設定'} / {profileResult.data.isActive ? '在籍中' : '非アクティブ'}
          </p>
        </section>
      ) : null}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>スタッフ</h2>
        <p style={{ margin: '8px 0 0', ...mutedText }}>公開されたシフトと勤務報告を確認できます。</p>
        <Link href={`${PREVIEW_BASE_PATH}/staff`} style={{ display: 'inline-block', marginTop: 12 }}>
          スタッフ画面を開く
        </Link>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>マネージャー</h2>
        <p style={{ margin: '8px 0 0', ...mutedText }}>スタッフ、シフト希望、週間スケジュールを確認できます。</p>
        <Link href={`${PREVIEW_BASE_PATH}/manager`} style={{ display: 'inline-block', marginTop: 12 }}>
          マネージャー画面を開く
        </Link>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>レシピ</h2>
        <p style={{ margin: '8px 0 0', ...mutedText }}>カテゴリー別に公開レシピを閲覧できます。</p>
        <Link href={`${PREVIEW_BASE_PATH}/recipes`} style={{ display: 'inline-block', marginTop: 12 }}>
          レシピを見る
        </Link>
      </section>
    </main>
  );
}
