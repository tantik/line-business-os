import type { ReactNode } from 'react';
import { card, demoColors } from '@/lib/demo/cafe/theme';

interface CafeStaffHeaderProps {
  mark: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  actions?: ReactNode;
}

export function CafeStaffHeader({ mark, title, subtitle, actions }: CafeStaffHeaderProps) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {mark}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
          <div style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: demoColors.textPrimary }}>
            {subtitle}
          </div>
        </div>
      </div>
      {actions ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>
      ) : null}
    </header>
  );
}

interface CafeStaffScheduleCardProps {
  title: ReactNode;
  headerActions?: ReactNode;
  schedule: ReactNode;
  legend: ReactNode;
  hoursLabel: ReactNode;
}

export function CafeStaffScheduleCard({
  title,
  headerActions,
  schedule,
  legend,
  hoursLabel,
}: CafeStaffScheduleCardProps) {
  return (
    <section style={{ ...card, padding: '14px 8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          padding: '0 8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
        </div>
        {headerActions}
      </div>
      <div style={{ marginTop: 12, padding: '0 4px' }}>{schedule}</div>
      <div style={{ marginTop: 12, padding: '0 8px' }}>{legend}</div>
      <p style={{ margin: '12px 8px 0', fontSize: 14, fontWeight: 700 }}>{hoursLabel}</p>
    </section>
  );
}

export function CafeStaffReportCard({ children }: { children: ReactNode }) {
  return <section style={card}>{children}</section>;
}

export function CafeStaffPreferenceCard({ children }: { children: ReactNode }) {
  return <section style={card}>{children}</section>;
}
