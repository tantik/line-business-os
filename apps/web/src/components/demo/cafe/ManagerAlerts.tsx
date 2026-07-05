import { demoColors } from '@/lib/demo/cafe/theme';
import type { ManagerAlert } from '@/lib/demo/cafe/types';

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
      <strong style={{ fontSize: 14 }}>要確認</strong>
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
