import type { ReactNode } from 'react';
import { ManagerHeader } from './ManagerHeader';
import { ManagerAlerts } from './ManagerAlerts';
import { pageStyle } from '@/lib/demo/cafe/theme';
import type { ManagerAlert } from '@/lib/demo/cafe/types';

export interface CafeManagerScreenProps {
  /** Line shown under "店長ダッシュボード" — brand/environment name for the demo, tenant/location name for the DB-backed preview. */
  subtitle: string;
  /** Optional right-aligned header slot (e.g. the demo's reset button, or the preview's "back to top" link). */
  rightSlot?: ReactNode;
  /** When set, the header brand mark links back to the Cafe hub. Omit for callers (like the DB-backed preview) that already provide their own back-to-hub affordance in `rightSlot`. */
  homeHref?: string;
  alerts: ManagerAlert[];
  alertActions?: ReactNode;
  children: ReactNode;
}

/**
 * Full manager-screen shell shared by `/demo/cafe/manager` and the DB-backed
 * `_client-preview/mame-to-cha/manager` page: page background, main
 * container, header, 要確認 alerts block, and section spacing all live here
 * once, so the two routes render as one product and differ only in the data
 * source/actions/states their section children supply.
 */
export function CafeManagerScreen({ subtitle, rightSlot, homeHref, alerts, alertActions, children }: CafeManagerScreenProps) {
  return (
    <main style={pageStyle(1180)}>
      <ManagerHeader subtitle={subtitle} rightSlot={rightSlot} homeHref={homeHref} />
      <div style={{ marginTop: 20 }}>
        <ManagerAlerts alerts={alerts} actionsSlot={alertActions} />
      </div>
      {children}
    </main>
  );
}
