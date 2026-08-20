import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { buttonSecondary, card, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';

/**
 * One entry-point button: either a popup trigger (`onClick`) or a plain
 * navigation (`href`) -- Manager's Recipes/Inventory/Manage-staff are
 * popups, Staff's Recipes/Inventory are still full-page links (popups for
 * Staff are the deferred Staff-surface follow-up mission's job, not this
 * card's).
 */
export interface EntryPointsCardButton {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EntryPointsCardProps {
  heading: string;
  subtitle?: ReactNode;
  buttons: EntryPointsCardButton[];
}

const buttonStyle: CSSProperties = { ...buttonSecondary };

/**
 * Shared "Staff & recipe & Inventory management" entry-point card --
 * consolidates what used to be scattered nav buttons (Recipes/Inventory in
 * the page header) plus, on Manager only, the separate Staff section's
 * "Manage staff" trigger, into one card matching the reference's grouping.
 * Reused by both Manager and Staff dashboards so the two surfaces stay
 * visually consistent without duplicating this layout.
 */
export function EntryPointsCard({ heading, subtitle, buttons }: EntryPointsCardProps) {
  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{heading}</h2>
      {subtitle ? <p style={{ margin: '4px 0 0', fontSize: 13, ...mutedText }}>{subtitle}</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {buttons.map((button) =>
          button.href ? (
            <Link key={button.key} href={button.href} className={hoverStyles.buttonSecondary} style={buttonStyle}>
              {button.label}
            </Link>
          ) : (
            <button key={button.key} type="button" className={hoverStyles.buttonSecondary} style={buttonStyle} onClick={button.onClick}>
              {button.label}
            </button>
          ),
        )}
      </div>
    </section>
  );
}
