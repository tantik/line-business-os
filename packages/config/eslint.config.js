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
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Guardrail: discourage reading service_role anywhere outside server packages.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env'] Literal[value='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            'service_role must only be read in server-side packages (api/worker/db). Never bundle into the web client.',
        },
      ],
    },
  },
);
