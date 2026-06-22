import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSIONS, requirePermission, writeAudit } from '@line-os/core';
import type { TenantContext, ModuleCode } from '@line-os/db/types';

/**
 * AI-first contract:
 *
 *   AI proposes  ->  Manager approves  ->  Backend applies  ->  Audit logs.
 *
 * AI never writes business data directly. It creates a `proposal`. A human with
 * `ai.approve` approves it. The backend then APPLIES the change through normal,
 * permission-checked module code and records an audit entry.
 *
 * All operations are tenant-scoped via TenantContext; cross-tenant data is
 * never accessible to an agent.
 */

export const ProposalInput = z.object({
  module: z.enum(['core', 'workforce', 'booking', 'logistics', 'crm', 'inventory', 'ai']),
  entity: z.string().min(1),
  entityId: z.string().optional(),
  action: z.enum(['create', 'update', 'delete', 'custom']),
  proposedChange: z.record(z.unknown()),
  rationale: z.string().optional(),
  agent: z.string().min(1),
  locationId: z.string().uuid().optional(),
});
export type ProposalInput = z.infer<typeof ProposalInput>;

/** Step 1: AI submits a proposal (requires ai.propose). */
export async function proposeChange(
  db: SupabaseClient,
  ctx: TenantContext,
  input: ProposalInput,
): Promise<{ id: string }> {
  requirePermission(ctx, PERMISSIONS.ai.propose);
  const parsed = ProposalInput.parse(input);

  const { data, error } = await db
    .schema('ai')
    .from('proposals')
    .insert({
      tenant_id: ctx.tenantId,
      location_id: parsed.locationId ?? ctx.locationId ?? null,
      module: parsed.module,
      entity: parsed.entity,
      entity_id: parsed.entityId ?? null,
      action: parsed.action,
      proposed_change: parsed.proposedChange,
      rationale: parsed.rationale ?? null,
      status: 'proposed',
      created_by_agent: parsed.agent,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id as string };
}

/**
 * Step 2 + 3: A human approver approves, then the provided `apply` function
 * performs the actual permission-checked mutation. The proposal is marked
 * applied/failed and an audit entry is written. AI is never in this path.
 */
export async function approveAndApply(
  db: SupabaseClient,
  ctx: TenantContext,
  proposalId: string,
  apply: (change: Record<string, unknown>) => Promise<{ entityId?: string }>,
): Promise<void> {
  requirePermission(ctx, PERMISSIONS.ai.approve);

  const { data: proposal, error } = await db
    .schema('ai')
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'proposed')
    .maybeSingle();

  if (error) throw error;
  if (!proposal) throw new Error('Proposal not found or not in proposable state');

  await db
    .schema('ai')
    .from('proposals')
    .update({ status: 'approved', reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() })
    .eq('id', proposalId);

  try {
    const result = await apply(proposal.proposed_change as Record<string, unknown>);
    await db
      .schema('ai')
      .from('proposals')
      .update({ status: 'applied', applied_at: new Date().toISOString() })
      .eq('id', proposalId);

    await writeAudit(db, {
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorKind: 'user',
      module: proposal.module as ModuleCode,
      entity: proposal.entity as string,
      entityId: result.entityId ?? (proposal.entity_id as string | undefined),
      action: `ai_apply:${proposal.action}`,
      metadata: { proposalId, agent: proposal.created_by_agent },
    });
  } catch (applyErr) {
    await db.schema('ai').from('proposals').update({ status: 'failed' }).eq('id', proposalId);
    throw applyErr;
  }
}

/** Reject a proposal (requires ai.approve). */
export async function rejectProposal(
  db: SupabaseClient,
  ctx: TenantContext,
  proposalId: string,
): Promise<void> {
  requirePermission(ctx, PERMISSIONS.ai.approve);
  await db
    .schema('ai')
    .from('proposals')
    .update({ status: 'rejected', reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('tenant_id', ctx.tenantId);
}
