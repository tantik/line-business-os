import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantAdminMembers } from '@/lib/tenant/admin-members';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { card, colors, linkAccent, mutedText, pageStyle, tableCell, tableHeaderCell } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const sectionCards = [
  {
    title: 'Локации / точки бизнеса',
    description: 'Управление физическими адресами, филиалами и бизнес-точками. Действия в данный момент отключены и будут добавлены в следующих фазах.',
  },
  {
    title: 'Модули SaaS',
    description: 'Активация дополнительных модулей, плагинов и интеграций для выбранного клиента / tenant. Действия в данный момент отключены и будут добавлены в следующих фазах.',
  },
  {
    title: 'Участники и роли',
    description: 'Управление доступами, добавление новых сотрудников и гибкая настройка ролей. Действия в данный момент отключены и будут добавлены в следующих фазах.',
  },
  {
    title: 'Billing / подписки',
    description: 'Управление подпиской, просмотр счетов, лимитов и тарифов. Действия в данный момент отключены и будут добавлены в следующих фазах.',
  },
];

type AdminMembersResult = Awaited<ReturnType<typeof listTenantAdminMembers>>;

function AdminMembersSummary({ result }: { result: AdminMembersResult }) {
  if (result.status === 'success') {
    return (
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Доступные участники</h2>
            <p style={{ margin: '6px 0 0', ...mutedText }}>
              Список только для чтения: участники текущего tenant, полученный через безопасный API-фасад. Действия управления будут доступны позже.
            </p>
          </div>
          <span style={{ ...mutedText, fontSize: 14, whiteSpace: 'nowrap' }}>
            всего: {result.data.length}
          </span>
        </div>

        {result.data.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>
            Нет доступных участников.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={tableHeaderCell}>Tenant</th>
                  <th style={tableHeaderCell}>Slug</th>
                  <th style={tableHeaderCell}>Kind</th>
                  <th style={tableHeaderCell}>Location scope</th>
                  <th style={tableHeaderCell}>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((member, index) => (
                  <tr
                    key={`${member.tenantId}:${member.locationId ?? 'all'}:${member.membershipStatus}:${index}`}
                  >
                    <td style={tableCell}>
                      <strong>{member.tenantName}</strong>
                    </td>
                    <td style={{ ...tableCell, overflowWrap: 'anywhere' }}>{member.tenantSlug}</td>
                    <td style={tableCell}>{member.tenantKind}</td>
                    <td style={{ ...tableCell, overflowWrap: 'anywhere' }}>
                      {member.locationId ?? 'All locations'}
                    </td>
                    <td style={tableCell}>{member.membershipStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  if (result.status === 'unauthorized') {
    return (
      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Доступные участники</h2>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          Список участников недоступен для данного клиента (tenant).
        </p>
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Доступные участники</h2>
      <p style={{ margin: '8px 0 0', ...mutedText }}>
        Не удалось загрузить список участников.
      </p>
    </section>
  );
}

export default async function TenantAdminPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const membersResult = await listTenantAdminMembers(supabase);

      return (
        <main style={pageStyle(960)}>
          <header>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>Внутренняя админ-панель LINE Business OS</h1>
            <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 15, lineHeight: '1.5' }}>
              Режим только чтение: панель для проверки текущего клиента, tenant scope и базовых SaaS-модулей. Действия управления будут добавлены позже.
            </p>
            <Link
              href="/dashboard"
              style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
            >
              Вернуться в панель управления
            </Link>
          </header>

          <section style={card}>
            <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 'bold' }}>Активный клиент / tenant</h2>
            <p style={{ margin: 0 }}>
              <strong>{activeTenant.tenantName}</strong> <span style={mutedText}>({activeTenant.tenantSlug})</span>
            </p>
          </section>

          <AdminMembersSummary result={membersResult} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            {sectionCards.map((item) => (
              <section key={item.title} style={{ ...card, marginTop: 0 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>{item.title}</h3>
                <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 13, lineHeight: '1.4' }}>
                  {item.description}
                </p>
              </section>
            ))}
          </div>

          <section
            style={{
              border: `1px solid ${colors.danger}`,
              backgroundColor: colors.dangerMuted,
              color: colors.dangerText,
              borderRadius: 8,
              padding: 16,
              marginTop: 16,
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16, fontWeight: 'bold', color: colors.danger }}>Безопасность</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: '1.4' }}>
              Эта страница работает в режиме строгого разграничения прав доступа. В целях безопасности на ней не отображаются конфиденциальные данные пользователей (такие как email, номера телефонов, user ID или auth ID), внутренние параметры ролей, метаданные, конфигурации, а также сырые ошибки базы данных.
            </p>
          </section>
        </main>
      );
    }
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    // `not_authenticated` is already redirected to sign-in by requireTenantContext.
    default:
      return <ErrorState />;
  }
}
