// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat ESLint config for the LINE Business OS monorepo.
 * Consume from any package: `export { default } from '@line-os/config/eslint';`
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript already reports undefined identifiers; the core rule produces
      // false positives for global/ambient types, so defer to the compiler.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // SECURITY GUARDRAIL: the privileged Supabase keys bypass RLS and must
      // never be read via process.env in application code (especially the web
      // client). Server code goes through the validated `serverEnv()` accessor
      // in @line-os/config; the browser reads only `@line-os/config/env/public`.
      // ERROR so `pnpm lint` fails on violation. Covers the legacy service_role
      // key AND the current secret-key model (SUPABASE_SECRET_KEY /
      // SUPABASE_SECRET_KEYS).
      'no-restricted-syntax': [
        'error',
        ...['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEYS'].flatMap(
          (name) => [
            {
              // Dot access: process.env.<name>
              selector: `MemberExpression[object.object.name='process'][object.property.name='env'][property.name='${name}']`,
              message: `Do not read ${name} from process.env. It bypasses RLS and must never reach the web client; server code uses serverEnv() from @line-os/config.`,
            },
            {
              // Bracket access: process.env['<name>']
              selector: `MemberExpression[object.object.name='process'][object.property.name='env'][property.value='${name}']`,
              message: `Do not read ${name} from process.env. It bypasses RLS and must never reach the web client; server code uses serverEnv() from @line-os/config.`,
            },
          ],
        ),
      ],
    },
  },
);
