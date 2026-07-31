'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import { Modal } from '@/components/demo/cafe/Modal';
import { PreviewStaffForm } from './preview-staff-form';
import { PreviewRecipeKindManager } from './preview-recipe-kind-manager';
import { buttonSecondary, card } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_STAFF_RECIPE_MANAGEMENT } from '@/lib/demo/cafe/helpContent';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

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
  /**
   * Pre-built "Manage Inventory" trigger (an embedded inventory manager panel),
   * assembled by the page -- which is where the active-location context is
   * legitimately resolved server-side -- so this island never carries any
   * location field itself. Rendered alongside Staff/Recipes so all three
   * management entry points live in one block.
   */
  inventorySlot?: ReactNode;
}

export function PreviewStaffRecipeManagement({ staff, recipes, inventorySlot }: PreviewStaffRecipeManagementProps) {
  const [staffOpen, setStaffOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 16 }}>{t('staffRecipeManagementTitle')}</strong>
        <DemoHelpButton content={HELP_MANAGER_STAFF_RECIPE_MANAGEMENT} />
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" style={buttonSecondary} onClick={() => setStaffOpen(true)}>
          {t('manageStaffButton')}
        </button>
        <button type="button" style={buttonSecondary} onClick={() => setRecipeOpen(true)}>
          {t('manageRecipesButton')}
        </button>
        {inventorySlot}
      </div>

      <Modal open={staffOpen} onClose={() => setStaffOpen(false)} title={t('manageStaffModalTitle')} maxWidth={760}>
        <PreviewStaffForm staff={staff} />
      </Modal>

      <Modal open={recipeOpen} onClose={() => setRecipeOpen(false)} title={t('manageRecipesModalTitle')} maxWidth={760}>
        <PreviewRecipeKindManager recipes={recipes} />
      </Modal>
    </section>
  );
}
