import Link from 'next/link';

const modules = [
  { href: '/workforce', label: 'Workforce', desc: 'Shifts, attendance, requests' },
  { href: '/booking', label: 'Booking', desc: 'Services, staff, reservations' },
];

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
      <h1>LINE Business OS</h1>
      <p>Multi-tenant platform. Every module runs inside the shared Core.</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {modules.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              style={{
                display: 'block',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 16,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <strong>{m.label}</strong>
              <div style={{ color: '#6b7280' }}>{m.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
