import Link from 'next/link';
import { card, mutedText, pageStyle } from '@/lib/ui/theme';

const modules = [
  { href: '/workforce', label: 'Workforce', desc: 'Shifts, attendance, requests' },
  { href: '/booking', label: 'Booking', desc: 'Services, staff, reservations' },
];

export default function HomePage() {
  return (
    <main style={pageStyle(720)}>
      <h1>LINE Business OS</h1>
      <p style={mutedText}>Multi-tenant platform. Every module runs inside the shared Core.</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {modules.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              style={{
                ...card,
                display: 'block',
                marginTop: 0,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <strong>{m.label}</strong>
              <div style={mutedText}>{m.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
