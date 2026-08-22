import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { buttonSecondary, card } from '@/lib/ui/theme';
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

/** Each button shares the row equally (`flex: 1`), same visual weight, instead of sizing to its own label length. */
const buttonStyle: CSSProperties = { ...buttonSecondary, flex: 1, justifyContent: 'center', textAlign: 'center' };

/**
 * Shared entry-point action row (Recipes/Inventory/Manage-staff on Manager;
 * Recipes/Inventory on Staff) -- consolidates what used to be scattered nav
 * buttons into one row matching the reference's grouping. Reused by both
 * dashboards so the two surfaces stay visually consistent.
 *
 * Attention polish pass (2026-08-21, Founder screenshot direction): dropped
 * the card's own heading/subtitle text entirely (previously "Staff & recipe
 * & Inventory management" / "N active / M total") -- the buttons' own
 * labels already say what they do, and the active/total staff count now
 * lives only inside the Manage-staff popup itself, not duplicated here. The
 * `heading`/`subtitle` props stay on the type (harmless if a caller still
 * passes them) so this is a pure visual simplification, not an API change
 * requiring every call site to be touched in the same pass. Buttons now
 * fill the full row width equally instead of sizing to their label.
 */
export function EntryPointsCard({ buttons }: EntryPointsCardProps) {
  return (
    <section style={{ ...card, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
    </section>
  );
}
