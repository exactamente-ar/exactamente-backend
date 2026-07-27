import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'uploads/**',
      'src/db/migrations/**',
      'docs/**',
      '.agents/**',
      '.worktrees/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      // Bun expone los globals de Node más los suyos.
      globals: { ...globals.node, Bun: 'readonly' },
    },
    rules: {
      // `_` para lo que se descarta a propósito, e ignoreRestSiblings para el
      // patrón `const { passwordHash, ...publicUser } = user`, que se usa en
      // varios lugares para no filtrar campos en las respuestas.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // Prettier último: apaga todo lo que sea de formato.
  prettier,
);
