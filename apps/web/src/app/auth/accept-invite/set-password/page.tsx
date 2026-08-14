import { mutedText, pageStyle } from '@/lib/ui/theme';
import { SetPasswordForm } from './SetPasswordForm';

// Session-dependent (relies on the just-established invite session): never prerender.
export const dynamic = 'force-dynamic';

/**
 * New-user Staff invitation acceptance screen (JA-first -- staff-facing, per
 * the original task brief §9). Reached ONLY via the /auth/accept-invite
 * callback route, which redirects here immediately after establishing the
 * session -- see that route's own comment for why nothing else may be
 * offered first.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation_id?: string }>;
}) {
  const { invitation_id: invitationId } = await searchParams;

  if (!invitationId) {
    return (
      <main style={pageStyle(420)}>
        <h1>招待リンクが正しくありません</h1>
        <p style={mutedText}>このリンクは無効です。マネージャーに再送を依頼してください。</p>
      </main>
    );
  }

  return (
    <main style={pageStyle(420)}>
      <h1>ようこそ ORUWA へ</h1>
      <p style={{ ...mutedText, marginTop: 0 }}>
        スタッフとしてログインするための、パスワードを設定してください。
      </p>
      <SetPasswordForm invitationId={invitationId} />
    </main>
  );
}
