#!/usr/bin/env node
// Kontrola odkazů v docs/code/*.md: jména v backtickách (identifikátory camelCase /
// SNAKE_CASE a soubory .ts/.tsx), která v repu (packages, apps, tools) neexistují.
// Spuštění: npm run check:docs. Obecná slova a jména mimo repo patří do EXCEPTIONS.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH_DIRS = ['packages', 'apps', 'tools'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'test-results',
  'playwright-report',
]);
const CODE_EXT = /\.(ts|tsx|mjs|js|py|json|sql|css)$/;
const EXCEPTIONS = new Set([
  'arrayBuffers', // pole z process.memoryUsage()
  'ProcessIncludes', // interní funkce Babylonu
]);

const words = new Set(); // všechny identifikátory z kódu
const files = new Set(); // názvy souborů
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else {
      files.add(name);
      if (CODE_EXT.test(name)) {
        for (const w of readFileSync(p, 'utf8').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
          words.add(w);
      }
    }
  }
}
for (const d of SEARCH_DIRS) walk(join(ROOT, d));

const docsDir = join(ROOT, 'docs/code');
const missing = new Map(); // jméno -> [soubor:řádek]
for (const f of readdirSync(docsDir).filter((n) => n.endsWith('.md'))) {
  readFileSync(join(docsDir, f), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/`([^`\n]+)`/g)) {
        for (const p of m[1].match(/[A-Za-z_][A-Za-z0-9_./-]*/g) ?? []) {
          const isFile = /\.(ts|tsx)$/.test(p);
          const isIdent =
            /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(p) ||
            /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(p) ||
            /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(p);
          if (!isFile && !isIdent) continue;
          const name = isFile ? p.split('/').pop() : p;
          if (EXCEPTIONS.has(name)) continue;
          if (isFile ? files.has(name) : words.has(name)) continue;
          if (!missing.has(name)) missing.set(name, []);
          missing.get(name).push(`${f}:${i + 1}`);
        }
      }
    });
}

if (missing.size === 0) {
  console.log('Odkazy v docs/code jsou v pořádku.');
} else {
  console.log(`Jména z docs/code, která v kódu neexistují (${missing.size}):`);
  for (const [name, where] of [...missing].sort())
    console.log(`  ${name}  <-  ${where.slice(0, 3).join(', ')}`);
  process.exitCode = 1;
}
