// Root ESLint flat config for the LINE Business OS monorepo.
//
// ESLint 9 searches upward from each package's working directory, so this file
// applies the shared config to every package that runs `eslint .` and does not
// provide its own flat config. The canonical rule set (including the
// service_role security guardrail) lives in @line-os/config so it can also be
// imported directly via `@line-os/config/eslint`.
export { default } from './packages/config/eslint.config.js';
