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
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 2px' }}>
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

interface CafeStaffStatusCardProps {
  title: ReactNode;
  status: ReactNode;
  children?: ReactNode;
}

export function CafeStaffStatusCard({ title, status, children }: CafeStaffStatusCardProps) {
  return (
    <section
      style={{
        border: `1px solid ${demoColors.border}`,
        borderRadius: 8,
        padding: 18,
        background: demoColors.surface,
        boxShadow: '0 1px 2px rgba(54, 43, 31, 0.04), 0 10px 24px rgba(54, 43, 31, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
        </div>
        {status}
      </div>
      {children ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </section>
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
