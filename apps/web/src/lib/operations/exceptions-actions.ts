'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { resolveOperationsException } from './exceptions';
import { parseResolveExceptionInput } from './exceptions-input';
import type { OperationsExceptionStatus } from './exceptions';
import type { OperationsWriteResult } from './result-types';

/**
 * Server Action for the Manager Attention slice (resolve an open Operations
 * exception only -- no reopen, no create). Thin controller: parse `FormData`
 * -> resolve tenant -> delegate to `exceptions.ts`'s service-layer helper,
 * which owns the actual `api.operations_resolve_exception` RPC call. Mirrors
 * `templates-actions.ts`'s exact shape.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function resolveException(
  formData: FormData,
): Promise<OperationsWriteResult<{ exceptionId: string; status: OperationsExceptionStatus }>> {
  const input = parseResolveExceptionInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return resolveOperationsException(supabase, tenantContext.data.activeTenant.tenantId, input.exceptionId, input.resolutionNote);
}
