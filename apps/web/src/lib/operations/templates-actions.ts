'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  addOperationsTemplateItem,
  createOperationsTemplate,
  replaceOperationsTemplateItem,
  retireOperationsTemplate,
  retireOperationsTemplateItem,
  updateOperationsTemplate,
  updateOperationsTemplateItem,
} from './templates';
import {
  parseAddTemplateItemInput,
  parseCreateTemplateInput,
  parseReplaceTemplateItemInput,
  parseRetireTemplateInput,
  parseRetireTemplateItemInput,
  parseUpdateTemplateInput,
  parseUpdateTemplateItemInput,
} from './templates-input';
import { parseBooleanFlag } from './validation';
import type { OperationsWriteResult } from './result-types';

/**
 * Server Actions for the Manager Operations Configuration slice (Templates +
 * Items only -- no scheduling, no task execution). Thin controllers: parse
 * `FormData` -> resolve tenant -> delegate to `templates.ts`'s service-layer
 * helpers, which own the actual `api.operations_*` RPC calls. Mirrors
 * `@/lib/workforce/staff-actions.ts`'s exact shape.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function createTemplate(formData: FormData): Promise<OperationsWriteResult<{ templateId: string }>> {
  const input = parseCreateTemplateInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return createOperationsTemplate(supabase, tenantContext.data.activeTenant.tenantId, input);
}

export async function updateTemplate(formData: FormData): Promise<OperationsWriteResult<{ templateId: string }>> {
  const input = parseUpdateTemplateInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return updateOperationsTemplate(supabase, tenantContext.data.activeTenant.tenantId, input);
}

export async function retireTemplate(formData: FormData): Promise<OperationsWriteResult<{ retiredOn: string }>> {
  const input = parseRetireTemplateInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return retireOperationsTemplate(supabase, tenantContext.data.activeTenant.tenantId, input.templateId, input.retiredOn);
}

export async function addTemplateItem(formData: FormData): Promise<OperationsWriteResult<{ itemId: string }>> {
  const input = parseAddTemplateItemInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return addOperationsTemplateItem(supabase, tenantContext.data.activeTenant.tenantId, input);
}

/** `isNumeric` (the item's own, immutable `responseType`) is threaded through from the client, which already has it from the loaded item list -- this action never changes `responseType`. */
export async function updateTemplateItem(formData: FormData): Promise<OperationsWriteResult<{ itemId: string }>> {
  const isNumeric = parseBooleanFlag(formData.get('isNumeric'));
  const input = parseUpdateTemplateItemInput(formData, isNumeric);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return updateOperationsTemplateItem(supabase, tenantContext.data.activeTenant.tenantId, input);
}

export async function retireTemplateItem(formData: FormData): Promise<OperationsWriteResult<{ itemId: string }>> {
  const input = parseRetireTemplateItemInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return retireOperationsTemplateItem(supabase, tenantContext.data.activeTenant.tenantId, input.itemId);
}

export async function replaceTemplateItem(formData: FormData): Promise<OperationsWriteResult<{ itemId: string }>> {
  const input = parseReplaceTemplateItemInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return replaceOperationsTemplateItem(supabase, tenantContext.data.activeTenant.tenantId, input);
}
