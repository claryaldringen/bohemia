import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTION_RIGHTS } from '@bohemia/game';
import { describe, expect, it } from 'vitest';

// Každá akce hráče nad vsí (`…ForPlayer` ve village.ts) jde přes `actOn` / `guardedAction`
// s klíčem z `ACTION_RIGHTS` (seniorate.md – Seniorát); akce, která zámek hráče nedrží (příkaz při
// varování, návrat z útěku – plán 2026-11-09, Úloha 12), přes `unlockedAction` – právo ověří
// stejně. Klíč hlídá už překlad; tenhle test hlídá, že žádná akce nezůstala bez volání (nová
// `…ForPlayer` bez práva) a že žádný klíč nezůstal nepoužitý.

const source = readFileSync(join(__dirname, '..', 'village.ts'), 'utf8');

describe('práva akcí nad vsí', () => {
  it('klíče předávané actOn / guardedAction / unlockedAction jsou přesně klíče ACTION_RIGHTS', () => {
    const used = new Set<string>();
    for (const m of source.matchAll(
      /(?:actOn|guardedAction|unlockedAction)\(\s*playerId,\s*villageId,([^]*?)\b(?:ctx|run)\b/g,
    )) {
      for (const k of m[1]!.matchAll(/'(\w+)'/g)) {
        if (k[1] !== 'sonId') used.add(k[1]!);
      }
    }
    expect([...used].sort()).toEqual(Object.keys(ACTION_RIGHTS).sort());
  });

  it('žádná akce `…ForPlayer` nevolá use-case mimo actOn / guardedAction / unlockedAction', () => {
    const functions = source.split(/\nexport (?:async )?function /).slice(1);
    // pohledy, zakládání vsi a přeskok času ves nemění akcí hráče
    const reads = ['villageView', 'foundVillage', 'skipTime', 'panelOptions', 'marketOverview'];
    const unguarded = functions.filter(
      (f) =>
        /^\w+ForPlayer\(/.test(f) &&
        !reads.some((r) => f.startsWith(r)) &&
        !/\b(actOn|guardedAction|unlockedAction)\(\s*playerId,\s*villageId,/.test(f),
    );
    expect(unguarded.map((f) => f.slice(0, 40))).toEqual([]);
  });

  it('každý klíč ACTION_RIGHTS se ve village.ts používá', () => {
    for (const key of Object.keys(ACTION_RIGHTS)) {
      expect(source, key).toContain(`'${key}'`);
    }
  });
});
