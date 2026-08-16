import { createClient } from '@/lib/supabase/server';
import { listMyPendingWorkforceInvitations } from '@/lib/workforce/invitations';
import { AcceptInvitationButton } from './AcceptInvitationButton';

/**
 * Existing-ORUWA-user pending-invitation banner (Founder decision 8,
 * docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md §3): when a person
 * already has an Auth account, the invite-employee Edge Function sends NO
 * new email -- this banner, visible on any authenticated session anywhere
 * in ORUWA, is the only surface that lets them accept. Self-scoped read
 * (`wf_employee_invitations_self_read`, 0064): a caller with no pending
 * invitation targeting them renders nothing.
 */
export async function PendingInvitationBanner() {
  const supabase = await createClient();
  const result = await listMyPendingWorkforceInvitations(supabase);
  if (result.status !== 'success' || result.data.length === 0) return null;

  return (
    <div
      style={{
        background: '#fff8e1',
        borderBottom: '1px solid #f0d98c',
        padding: '10px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        fontSize: 14,
      }}
    >
      <span>
        {result.data.length === 1
          ? 'スタッフとして招待されています。'
          : `${result.data.length}件のスタッフ招待があります。`}
      </span>
      {result.data.map((invitation) => (
        <AcceptInvitationButton key={invitation.invitationId} invitationId={invitation.invitationId} />
      ))}
    </div>
  );
}
