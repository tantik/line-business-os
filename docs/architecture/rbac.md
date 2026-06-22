# RBAC

Module-based, data-driven role-based access control.

## Roles

| Role             | Scope    | Summary                                          |
| ---------------- | -------- | ------------------------------------------------ |
| Platform Owner   | platform | Full platform access (bypasses tenant checks)    |
| Platform Support | platform | Support access across tenants                     |
| Tenant Owner     | tenant   | Everything within the tenant, incl. billing       |
| Tenant Admin     | tenant   | Everything except billing                         |
| Manager          | tenant/location | Operate modules, approve requests/AI proposals |
| Employee         | tenant/location | Read shifts, manage own attendance, propose    |
| Client           | tenant   | Read own bookings                                 |

Platform staff are flagged via `core.users.is_platform_staff`. System roles live
in `core.roles` with `tenant_id = null`; tenants may add custom roles.

## Permissions

Permissions are strings: `module.entity.action`. Catalog in `core.permissions`
and mirrored in `packages/core/src/permissions.ts`.

Examples:

```
core.member.invite        booking.booking.read
core.role.manage          booking.booking.write
core.billing.manage       booking.service.manage
workforce.shift.read      ai.propose
workforce.shift.write     ai.approve
workforce.attendance.manage
```

## How a grant works

`core.role_assignments` links `(tenant_id, user_id, role_id, location_id?)`.
- `location_id = null` → tenant-wide grant.
- `location_id = X` → grant only within location X.

`core.role_permissions` maps roles → permission keys.

## Enforcement (two layers)

1. **Database**: RLS policies call `core.has_permission(tenant, key, location)`.
2. **Application**: `requirePermission(ctx, key)` in `packages/core` before any
   privileged operation, using permissions resolved by `resolveTenantContext`.
