export default function WorkforcePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
      <h1>Workforce</h1>
      <p>
        Module routes live under <code>/workforce</code>. Migrate cafe-shift UI here, replacing
        mock data with the Core API and applying tenant/RLS/RBAC.
      </p>
      <ul>
        <li>
          <a href="/workforce/shifts">/workforce/shifts</a> (legacy <code>/shifts</code> redirects here)
        </li>
        <li>
          <a href="/workforce/manager">/workforce/manager</a> (legacy <code>/manager</code> redirects here)
        </li>
      </ul>
    </main>
  );
}
