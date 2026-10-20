import { createClient } from '@/lib/supabase/server';
import { listMyPendingTenantInvitations } from '@/lib/tenant/tenant-invitations';
import { partitionBannerInvitations } from '@/lib/tenant/tenant-invite-decision';
import { AcceptTenantInvitationButton } from './AcceptTenantInvitationButton';

/**
 * In-app banner for a tenant (Owner) invitation sent to an address that
 * already has an ORUWA account (Stage 4B-3, DEBT-110 b): the provision-tenant
 * function sends NO email then, so this banner -- on every authenticated
 * page, next to the Staff `PendingInvitationBanner` -- is where the person
 * accepts. Self-scoped read (`api.my_pending_tenant_invitations`, 0134,
 * `core.current_user_id()` from the JWT); renders nothing when there is
 * nothing open. Expired invitations are not offered (accepting would fail).
 */
export async function PendingTenantInvitationBanner() {
  const supabase = await createClient();
  const result = await listMyPendingTenantInvitations(supabase);
  if (result.status !== 'success') return null;
  const { open } = partitionBannerInvitations(result.data);
  if (open.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="オーナー招待"
      style={{
        background: '#fff8e1',
        borderBottom: '1px solid #f0d98c',
        padding: '10px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 14,
      }}
    >
      {open.map((invitation) => (
        <div key={invitation.invitationId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span>「{invitation.tenantName}」のオーナーとして招待されています。</span>
          <AcceptTenantInvitationButton invitationId={invitation.invitationId} />
        </div>
      ))}
    </div>
  );
}
