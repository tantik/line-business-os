import base from '@line-os/config/eslint';

/**
 * Web app ESLint flat config.
 *
 * Replaces the deprecated `next lint` with the ESLint CLI so `pnpm lint` is
 * non-interactive and CI-safe. Inherits the shared rules (including the
 * service_role guardrail) and adds web-only bans: the browser bundle must never
 * import the service-role client or otherwise touch service_role.
 */
export default [
  // Next.js generated artifacts are not ours to lint.
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@line-os/db',
              importNames: ['createServiceClient'],
              message:
                'apps/web must never import createServiceClient. The web bundle uses the anon key + RLS only; service_role is server-only.',
            },
          ],
        },
      ],
    },
  },
];
