import { demoColors } from '@/lib/demo/cafe/theme';
import type { ManagerAlert } from '@/lib/demo/cafe/types';
import { DemoHelpButton } from './DemoHelpButton';
import { HELP_MANAGER_ALERTS } from '@/lib/demo/cafe/helpContent';

interface ManagerAlertsProps {
  alerts: ManagerAlert[];
}

/** 要確認 block — renders nothing when there is nothing to confirm. */
export function ManagerAlerts({ alerts }: ManagerAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <section
      style={{
        border: `1px solid ${demoColors.warning}`,
        background: demoColors.alertWarningBg,
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong style={{ fontSize: 14 }}>要確認</strong>
        <DemoHelpButton content={HELP_MANAGER_ALERTS} />
      </div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
        {alerts.map((alert) => (
          <li key={alert.id} style={{ color: alert.tone === 'danger' ? demoColors.dangerText : demoColors.textPrimary }}>
            {alert.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
