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
// Determinismus: čas a náhoda přicházejí parametrem nebo přes port, nikdy z globálu.
const determinismProperties = [
  { object: 'Date', property: 'now', message: 'Čas předej parametrem (port Clock).' },
  { object: 'Math', property: 'random', message: 'Náhodu předej přes port.' },
];
const determinismSyntax = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Čas předej parametrem (port Clock).',
  },
];
// Vrstvu překážek počítá server i prohlížeč a musí jim vyjít bit po bitu stejně – jen operace,
// které IEEE 754 zaokrouhluje přesně. Tyhle funkce jsou v JS „implementation-approximated“.
const APPROXIMATED_MATH = [
  'sin',
  'cos',
  'tan',
  'atan',
  'atan2',
  'hypot',
  'exp',
  'log',
  'pow',
  'cbrt',
];
const exactMathProperties = APPROXIMATED_MATH.map((property) => ({
  object: 'Math',
  property,
  message: 'Vrstva překážek musí být deterministická napříč enginy – použij det-math.ts.',
}));
const exactMathSyntax = [
  {
    selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
    message: 'Mocnina ** je v JS přibližná – v deterministické vrstvě násob, nebo napiš konstantu.',
  },
];
/** Soubory, ze kterých vzniká vrstva překážek a síť pěšin (počítá je server i prohlížeč). */
const DETERMINISTIC_LAYER_FILES = [
  'packages/game/src/domain/landscape/obstacles/**/*.ts',
  'packages/game/src/domain/landscape/forest-field.ts',
  'packages/game/src/domain/landscape/stream-geometry.ts',
  'packages/game/src/domain/landscape/relief.ts',
  'packages/game/src/domain/landscape/det-math.ts',
  'packages/game/src/domain/landscape/quantize.ts',
  'packages/game/src/domain/landscape/world.ts',
  // vyšlapané pěšiny – síť počítá server (vzdálenost chůze na pole) i prohlížeč (vzhled)
  'packages/game/src/domain/village/paths/**/*.ts',
  // natočené stavby – mřížky čtverců (fields.md – Natočené stavby) jdou do sítě pěšin
  'packages/game/src/domain/village/square-grid.ts',
  // obvod opevnění (fortifications.md – Obvod) – tvar, úseky a brány u kurzoru i na serveru
  'packages/game/src/domain/village/fortification/**/*.ts',
  // síla vojska a pravidla války (war.md) – tažení počítá server i prohlížeč
  'packages/game/src/domain/war/**/*.ts',
  // varianty rozměrů obydlí (population.md – Varianty rozměrů) – tvar staveb u kurzoru i na serveru
  'packages/game/src/domain/village/dwelling-shape.ts',
  // plán sídla správce (steward.md – Mapa hodnot krajiny) – ukládá se do stavu, dopočet po kouscích
  // ho musí zopakovat
  'packages/game/src/domain/village/steward-land.ts',
  'packages/game/src/domain/village/steward-plan.ts',
  // den správce (steward.md – Rozhodovací pořadí) – stavby správce jsou ve stavu vsi
  'packages/game/src/domain/village/steward.ts',
  'packages/game/src/domain/village/steward-extras.ts',
  'packages/game/src/domain/village/steward-rebuild.ts',
];

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
      'no-restricted-properties': ['error', ...determinismProperties],
      'no-restricted-syntax': ['error', ...determinismSyntax],
    },
  },
  {
    // Knihovna pro composition rooty (web, worker): smí node:*, @bohemia/db a @bohemia/game,
    // ale ne rámce jednotlivých vstupních bodů.
    files: ['packages/server/src/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'better-auth',
                'better-auth/*',
                'server-only',
              ],
              message:
                '@bohemia/server je sdílený vstupními body – žádný Next, React ani Better Auth.',
            },
          ],
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
    // Pozdější pravidlo přepíše dřívější celé – proto i pravidla determinismu výše.
    files: DETERMINISTIC_LAYER_FILES,
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-properties': ['error', ...determinismProperties, ...exactMathProperties],
      'no-restricted-syntax': ['error', ...determinismSyntax, ...exactMathSyntax],
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
