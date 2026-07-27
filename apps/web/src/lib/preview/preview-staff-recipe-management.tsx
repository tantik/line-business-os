'use client';

import { useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { Modal } from '@/components/demo/cafe/Modal';
import { PreviewStaffForm } from './preview-staff-form';
import { PreviewRecipeKindManager } from './preview-recipe-kind-manager';
import { buttonSecondary, card } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_STAFF_RECIPE_MANAGEMENT } from '@/lib/demo/cafe/helpContent';

/**
 * Demo/Preview manager UX parity: the demo's スタッフ・レシピ管理 card only ever
 * shows two trigger buttons on the main dashboard - the create/edit forms
 * open in a dialog on demand. This wraps the existing preview manager
 * islands (`PreviewStaffForm`/`PreviewRecipeKindManager`, which already call
 * only their allowlisted preview Server Actions) in the same dialog pattern,
 * with zero change to those islands or the actions they call.
 */
export interface PreviewStaffRecipeManagementProps {
  staff: WorkforceStaffManageEntry[] | null;
  recipes: WorkforceRecipe[] | null;
}

export function PreviewStaffRecipeManagement({ staff, recipes }: PreviewStaffRecipeManagementProps) {
  const [staffOpen, setStaffOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 16 }}>スタッフ・レシピ管理</strong>
        <DemoHelpButton content={HELP_MANAGER_STAFF_RECIPE_MANAGEMENT} />
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" style={buttonSecondary} onClick={() => setStaffOpen(true)}>
          スタッフ管理
        </button>
        <button type="button" style={buttonSecondary} onClick={() => setRecipeOpen(true)}>
          レシピ管理
        </button>
      </div>

      <Modal open={staffOpen} onClose={() => setStaffOpen(false)} title="スタッフ管理" maxWidth={640}>
        <PreviewStaffForm staff={staff} />
      </Modal>

      <Modal open={recipeOpen} onClose={() => setRecipeOpen(false)} title="レシピ管理" maxWidth={640}>
        <PreviewRecipeKindManager recipes={recipes} />
      </Modal>
    </section>
  );
}
