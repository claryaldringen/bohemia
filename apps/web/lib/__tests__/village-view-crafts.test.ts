import { beforeAll, describe, expect, it } from 'vitest';
import {
  CRAFT_BASE,
  dayIndexOf,
  newWorkshop,
  foundVillage,
  generateAcceptedLandscape,
  summarizeVillage,
  type Landscape,
  type VillageState,
  type Craft,
} from '@bohemia/game';
import { craftsView } from '../village-view-crafts';

// Údaje dílen zlata v pohledu vsi (gold.md – Pravidla 1–4; plán 6, úloha 9).

const DAY = dayIndexOf({ year: 601, month: 5, day: 10 });

function withWorkshop(craft: Craft, patch: Partial<VillageState> = {}): VillageState {
  const base = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  return {
    ...base,
    ...patch,
    dwellings: [
      ...base.dwellings,
      {
        id: 50,
        type: CRAFT_BASE[craft],
        builtDay: DAY,
        condition: 1,
        position: { x: 10, z: 0, rotation: 0 },
        workshop: {
          ...newWorkshop(craft),
          ...(craft === 'panner' ? { placer: { index: 1, walkM: 240 } } : {}),
        },
      },
    ],
  };
}

describe('craftsView – dílny zlata', () => {
  let landscape: Landscape;
  beforeAll(() => {
    landscape = generateAcceptedLandscape(11, undefined, 'gold-stream').landscape;
  });
  const gold = (s: VillageState, l: Landscape | null = null): Record<string, unknown> | undefined =>
    craftsView(s, summarizeVillage(s, DAY, null, l)).workshops[0]?.gold;

  it('rýžovník na náplavu 1: zbývající náplavy, zbytek a chůze', () => {
    // bez vyrýžovaného náplavu se zlatem mají všechny náplavy krajiny
    const count = Number(gold(withWorkshop('panner'), landscape)?.placersLeft);
    expect(count).toBeGreaterThanOrEqual(2);
    const s = withWorkshop('panner', { goldPanned: [1500, 300] });
    expect(gold(s, landscape)).toEqual({
      craft: 'panner',
      placersLeft: count - 1,
      leftG: 1200,
      walkM: 240,
      season: { from: 4, to: 10 },
    });
  });

  it('šperkař: výhoda a kov', () => {
    const s = withWorkshop('jeweller', { gold: 20, coins: 40, jewelleryG: 30 });
    expect(gold(s)).toEqual({
      craft: 'jeweller',
      wroughtG: 30,
      materialG: 20 + 40 * 2.4,
      factor: 1.5,
    });
  });

  it('mincovna: zlato na setiny; ostatní dílny bez údaje', () => {
    expect(gold(withWorkshop('minter', { gold: 7.9 }))).toEqual({ craft: 'minter', goldG: 7.9 });
    expect(gold(withWorkshop('smith'))).toBeUndefined();
  });
});
