import type { ReactNode } from 'react';
import { demoColors } from '@/lib/demo/cafe/theme';
import type { ManagerAlert } from '@/lib/demo/cafe/types';
import { DemoHelpButton } from './DemoHelpButton';
import { HELP_MANAGER_ALERTS } from '@/lib/demo/cafe/helpContent';

interface ManagerAlertsProps {
  alerts: ManagerAlert[];
  actionsSlot?: ReactNode;
}

/** 要確認 block — renders nothing when there is nothing to confirm. */
export function ManagerAlerts({ alerts, actionsSlot }: ManagerAlertsProps) {
  if (alerts.length === 0 && !actionsSlot) return null;

  return (
    <section
      style={{
        border: `1px solid ${demoColors.warning}`,
        background: demoColors.alertWarningBg,
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 14 }}>要確認</strong>
          <DemoHelpButton content={HELP_MANAGER_ALERTS} />
        </div>
        {actionsSlot}
      </div>
      {alerts.length > 0 ? (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {alerts.map((alert) => (
            <li key={alert.id} style={{ color: alert.tone === 'danger' ? demoColors.dangerText : demoColors.textPrimary }}>
              {alert.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
