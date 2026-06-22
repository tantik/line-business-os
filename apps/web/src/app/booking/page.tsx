export default function BookingPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
      <h1>Booking</h1>
      <p>
        Module routes live under <code>/booking</code>. Migrate line-app salon logic here, replacing
        mock data with the Core API and applying tenant/RLS/RBAC.
      </p>
      <ul>
        <li>
          <a href="/booking/admin">/booking/admin</a>
        </li>
        <li>
          <a href="/booking/new">/booking/new</a> (public booking)
        </li>
      </ul>
    </main>
  );
}
