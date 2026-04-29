import js from '@eslint/js';
import nodePlugin from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

const packageSourceFiles = ['packages/*/src/**/*.ts'];
const sourceTypeCheckedConfigs = tseslint.configs.recommendedTypeCheckedOnly.map((config) => ({
  ...config,
  files: packageSourceFiles,
}));

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...sourceTypeCheckedConfigs,
  {
    files: packageSourceFiles,
    plugins: {
      n: nodePlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'n/no-missing-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
);
