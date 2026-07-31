// ESLint configuration.
//
// Deliberately small. TypeScript's own strict mode — with
// noUncheckedIndexedAccess and exactOptionalPropertyTypes — already catches
// most of what a large rule set would, and rules that merely restate the
// compiler train people to ignore the output.
//
// What is here covers the things tsc does not: control characters in regular
// expressions (this codebase handles terminal escape sequences, where an
// accidental literal is a real hazard), and a handful of correctness rules.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated output, none of it hand-written and none of it ours to fix.
    // `.next/` matters as much as `dist/`: it is git-ignored, so it is absent
    // in CI and present the moment anyone builds locally — which made `pnpm
    // lint` fail with thousands of errors on a developer's machine and pass on
    // the runner. A discrepancy like that teaches people to distrust the lint
    // step, which is worse than the errors.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'build/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },

    rules: {
      // Unused variables are a real signal; an underscore prefix is the
      // documented way to say "deliberately ignored".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Control characters in regexes are usually a mistake — but not here.
      // This codebase strips ANSI escapes and C0 ranges, so the rule stays on
      // and the intentional cases carry an inline disable that documents them.
      'no-control-regex': 'error',

      // `any` defeats the point of the strict compiler settings.
      '@typescript-eslint/no-explicit-any': 'error',

      // Prefer the compiler's exhaustiveness checking over runtime guesses.
      'no-fallthrough': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    // Tests reach into internals and assert on shapes the compiler cannot
    // narrow, so a couple of rules would only produce noise there.
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
