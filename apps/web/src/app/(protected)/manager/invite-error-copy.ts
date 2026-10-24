import type { tManagerDashboard } from './manager-dashboard-i18n';

type InviteErrorCopyKey = Extract<
  Parameters<typeof tManagerDashboard>[1],
  'inviteErrorNotFound' | 'inviteErrorDuplicate' | 'inviteErrorUserHasOtherEmployeeRecord' | 'errorUnauthorizedAction' | 'inviteErrorGeneric'
>;

/**
 * Dictionary key for a failed invite / resend (InvitationCell). Never the
 * result's own `message` (English infra text) -- always one of this fixed,
 * localized set. A `duplicate` with code `user_has_other_employee_record`
 * (0140, DEBT-123 c) gets its own actionable copy: reactivate the earlier
 * staff record instead of re-hiring on a new one.
 */
export function inviteErrorCopyKey(result: { status: string; code?: string }): InviteErrorCopyKey {
  switch (result.status) {
    case 'not_found':
      return 'inviteErrorNotFound';
    case 'duplicate':
      return result.code === 'user_has_other_employee_record' ? 'inviteErrorUserHasOtherEmployeeRecord' : 'inviteErrorDuplicate';
    case 'unauthorized':
      return 'errorUnauthorizedAction';
    default:
      return 'inviteErrorGeneric';
  }
}
