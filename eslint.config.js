import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/out/**', '**/node_modules/**', 'userData/**', 'coverage/**', 'tests/fixtures/**'],
  },
  ...tseslint.configs.recommended,
];
