/**
 * Canonical permission keys, mirrored from the DB permission catalog
 * (supabase/migrations/0008_rbac_seed.sql). Keep these in sync.
 */
export const PERMISSIONS = {
  core: {
    memberInvite: 'core.member.invite',
    roleManage: 'core.role.manage',
    billingManage: 'core.billing.manage',
    locationManage: 'core.location.manage',
    lineManage: 'core.line.manage',
    auditRead: 'core.audit.read',
  },
  workforce: {
    shiftRead: 'workforce.shift.read',
    shiftWrite: 'workforce.shift.write',
    attendanceManage: 'workforce.attendance.manage',
    requestManage: 'workforce.request.manage',
    staffRead: 'workforce.staff.read',
    staffManage: 'workforce.staff.manage',
    recipeRead: 'workforce.recipe.read',
    recipeManage: 'workforce.recipe.manage',
    recipePublish: 'workforce.recipe.publish',
  },
  booking: {
    bookingRead: 'booking.booking.read',
    bookingWrite: 'booking.booking.write',
    serviceManage: 'booking.service.manage',
  },
  ai: {
    propose: 'ai.propose',
    approve: 'ai.approve',
  },
} as const;

export type PermissionKey =
  | (typeof PERMISSIONS.core)[keyof typeof PERMISSIONS.core]
  | (typeof PERMISSIONS.workforce)[keyof typeof PERMISSIONS.workforce]
  | (typeof PERMISSIONS.booking)[keyof typeof PERMISSIONS.booking]
  | (typeof PERMISSIONS.ai)[keyof typeof PERMISSIONS.ai];

export class PermissionError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing required permission: ${permission}`);
    this.name = 'PermissionError';
  }
}
