import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Hexagonální architektura (viz CLAUDE.md): doména a use-casy v packages/game nesmí sahat
// na infrastrukturu – ta patří do adaptérů (packages/db) a vstupních bodů (apps/*).
const INFRASTRUCTURE = [
  '@bohemia/db',
  '@bohemia/db/*',
  'drizzle-orm',
  'drizzle-orm/*',
  'pg',
  'next',
  'next/*',
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  'better-auth',
  'better-auth/*',
  'node:*',
  'fs',
  'path',
  'crypto',
  'child_process',
];
const infrastructureRule = {
  group: INFRASTRUCTURE,
  message: 'Herní jádro nesmí importovat infrastrukturu – použij port (rozhraní) a adaptér.',
};
const domainRule = {
  group: ['**/application', '**/application/**'],
  message: 'Doména nesmí záviset na use-casech – závislosti míří jen dovnitř.',
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
    ],
  },
  tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
    },
  },
  {
    // Jen klasická pravidla hooků – doporučená sada v7 přidává pravidla React Compileru.
    files: ['apps/web/**/*.tsx', 'apps/web/hooks/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['packages/game/src/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [infrastructureRule] }],
      // Determinismus: čas a náhoda přicházejí parametrem nebo přes port, nikdy z globálu.
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Čas předej parametrem (port Clock).' },
        { object: 'Math', property: 'random', message: 'Náhodu předej přes port.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Čas předej parametrem (port Clock).',
        },
      ],
    },
  },
  {
    files: ['packages/game/src/domain/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [infrastructureRule, domainRule] }],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
