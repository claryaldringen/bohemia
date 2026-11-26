import { beforeAll, describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { generateAcceptedLandscape, obstaclesOf, type Landscape } from '../../../landscape';
import { foundField, foundVillage, startWorkshop } from '../../core/actions';
import { goldPlacers } from '../../core/premium-effects';
import { applyBuildIntent } from '../../buildings/build-intent';
import { BUILD_COSTS, workshopBuildCost } from '../../buildings/costs';
import { NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import { CRAFT_BASE, CRAFTS, workshopCost } from '../../rules/rules-crafts';
import { STEWARD_CRAFTS } from '../../rules/rules-steward';
import { workshopValue } from '../../steward/steward';
import type { Craft, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';
import { restingCrafters, newWorkshop } from '../crafts';
import {
  GOLD_CRAFTS,
  MINT_YEAR,
  PANNER_NO_PLACER,
  PANNER_PLACERS_EMPTY,
  placerLeftG,
  workshopBlocked,
} from '../gold-crafts';
import { PANNING } from '../../rules/rules-gold';

// Dílny zlata – typy, výčty a správce (plán 6, úloha 3a; gold.md – Pravidla 2, 4, 5).

const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const YEAR = 365.25;
const WORKSHOP_ID = 50;

const person = (id: number, years: number, dwellingId: number, day = DAY): Person => ({
  id,
  bornDay: day - Math.ceil(years * YEAR),
  dwellingId,
});

/** Ves s obydlenou dílnou `craft` (domácnost dvou dospělých) a 100 kg keramiky. */
function villageWith(craft: Craft): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = [person(2, 25, 1), person(3, 25, 1), person(4, 20, 1), person(5, 19, 1)];
  s.constructions = [];
  s.storesKg = 50_000;
  s.lastDay = DAY;
  s.nextId = 100;
  s.dwellings.push({
    id: WORKSHOP_ID,
    type: CRAFT_BASE[craft],
    builtDay: DAY,
    condition: 1,
    position: { x: 40, z: 0, rotation: 0 },
    workshop: newWorkshop(craft),
  });
  s.people.push(person(60, 24, WORKSHOP_ID), person(61, 22, WORKSHOP_ID));
  s.crafts = { charcoalKg: 0, potteryKg: 100 };
  return withoutSmallGame(s);
}

describe('dílny zlata – past else (workCrafts)', () => {
  it.each(GOLD_CRAFTS)('%s nevyrábí keramiku ani nekácí a není ve větvi hrnčíře', (craft) => {
    const s = villageWith(craft);
    const after = advanceVillage(s, DAY + 10, null);
    const workshop = after.dwellings.find((d) => d.id === WORKSHOP_ID)!.workshop!;
    expect(after.crafts?.potteryKg ?? 0).toBeLessThanOrEqual(100);
    expect(workshop.felling).toBeNull();
    expect(workshop.activity).not.toBe('producing');
    // rýžovník bez krajiny nemá náplav (úloha 4), šperkař a mincíř zatím odpočívají (úloha 5)
    expect(workshop.activity).toBe(craft === 'panner' ? 'no-placer' : 'resting');
  });

  it.each(GOLD_CRAFTS)('%s: domácnost pracuje se vsí (resting, rýžovník no-placer)', (craft) => {
    const s = villageWith(craft);
    const resting = restingCrafters(s, DAY, NO_CRAFTS);
    expect(resting.get(WORKSHOP_ID)).toBe(craft === 'panner' ? 'no-placer' : 'resting');
  });
});

describe('dílny zlata – cena a výčty', () => {
  it('rýžovník stojí zemnici × 1,3, šperkař jako kovář, mincíř podle BUILD_COSTS', () => {
    expect(workshopCost('panner')).toBe(Math.round(workshopCost('burner') * 1.3));
    expect(workshopCost('jeweller')).toBe(workshopCost('smith'));
    expect(BUILD_COSTS.minter).toEqual(workshopBuildCost('minter'));
    expect(BUILD_COSTS.panner).toEqual(workshopBuildCost('panner'));
    expect(BUILD_COSTS.jeweller).toEqual(workshopBuildCost('jeweller'));
  });

  it('pořadí dílen se nemění, dílny zlata jsou v CRAFTS mezi dnešními', () => {
    expect(CRAFTS).toEqual([
      'burner',
      'panner',
      'potter',
      'smith',
      'jeweller',
      'minter',
      'carpenter',
    ]);
    expect(CRAFTS.filter((c) => !GOLD_CRAFTS.includes(c))).toEqual([
      'burner',
      'potter',
      'smith',
      'carpenter',
    ]);
  });
});

describe('dílny zlata – správce', () => {
  it('STEWARD_CRAFTS jsou dnešní čtyři a nemají nic ze zlata', () => {
    expect(STEWARD_CRAFTS).toEqual(['burner', 'potter', 'smith', 'carpenter']);
    for (const craft of GOLD_CRAFTS) expect(STEWARD_CRAFTS).not.toContain(craft);
  });

  it('hodnota dílen zlata je 0 i ve vsi s poli (kontrola: uhlíř má kladnou)', () => {
    const day = dayIndexOf({ year: 600, month: 8, day: 1 });
    const s = foundField(
      withBuiltFirstDwelling(
        foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
      ),
      day,
      {
        parts: Array.from({ length: 40 }, () => ({
          areaM2: 225,
          distanceM: 50,
          naturalFertility: 70,
          surface: 'meadow' as const,
          obstacleCost: 0,
        })),
      },
    );
    for (const p of s.parts) {
      p.foundingDone = p.foundingCost;
      p.state = 'ready';
    }
    s.constructions.at(-1)!.done = s.constructions.at(-1)!.cost;
    s.dwellings = Array.from({ length: 8 }, (_, k) => ({ ...s.dwellings[0]!, id: 90_000 + k }));
    const after = advanceVillage(s, dayIndexOf({ year: 600, month: 9, day: 1 }), null);
    const when = after.lastDay;
    expect(workshopValue(after, when, 'burner', NO_CRAFTS)).toBeGreaterThan(0);
    for (const craft of GOLD_CRAFTS) expect(workshopValue(after, when, craft, NO_CRAFTS)).toBe(0);
  });
});

describe('dílny zlata – zámky (plán 6, úloha 3b)', () => {
  const LAST_949 = dayIndexOf({ year: 949, month: 12, day: 31 });
  const FIRST_950 = dayIndexOf({ year: 950, month: 1, day: 1 });
  let plain: Landscape;
  let gold: Landscape;
  beforeAll(() => {
    plain = generateAcceptedLandscape(11).landscape;
    gold = generateAcceptedLandscape(11, undefined, 'gold-stream').landscape;
  });
  const fresh = (day: number): VillageState =>
    withBuiltFirstDwelling(
      foundVillage({ seed: 5, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );

  it('goldPlacers: krajina bez typu a bez krajiny [], gold-stream 3–6 náplavů na cm', () => {
    expect(goldPlacers(null)).toEqual([]);
    expect(goldPlacers(plain)).toEqual([]);
    const placers = goldPlacers(gold);
    expect(placers.length).toBeGreaterThanOrEqual(3);
    expect(placers.length).toBeLessThanOrEqual(6);
    for (const p of placers) expect(p.x * 100).toBeCloseTo(Math.round(p.x * 100), 6);
  });

  it('rýžovník: bez náplavu / s náplavem / vyrýžováno; šperkař vždy null', () => {
    const s = fresh(DAY);
    expect(workshopBlocked(s, DAY, plain, 'panner')).toBe(PANNER_NO_PLACER);
    expect(workshopBlocked(s, DAY, null, 'panner')).toBe(PANNER_NO_PLACER);
    expect(workshopBlocked(s, DAY, gold, 'panner')).toBeNull();
    const n = goldPlacers(gold).length;
    s.goldPanned = Array.from({ length: n }, () => 1_500);
    expect(workshopBlocked(s, DAY, gold, 'panner')).toBe(PANNER_PLACERS_EMPTY);
    s.goldPanned[0] = 1_499;
    expect(workshopBlocked(s, DAY, gold, 'panner')).toBeNull();
    for (const l of [plain, gold, null]) expect(workshopBlocked(s, DAY, l, 'jeweller')).toBeNull();
    expect(workshopBlocked(s, DAY, plain, 'smith')).toBeNull();
  });

  it('placerLeftG: zbývá placerG − vyrýžováno, nejméně 0', () => {
    expect(placerLeftG({}, 0)).toBe(PANNING.placerG);
    expect(placerLeftG({ goldPanned: [400.5] }, 0)).toBe(PANNING.placerG - 400.5);
    expect(placerLeftG({ goldPanned: [2_000] }, 0)).toBe(0);
    expect(placerLeftG({ goldPanned: [10] }, 3)).toBe(PANNING.placerG);
  });

  it('mincovna až od 1. 1. 950', () => {
    expect(MINT_YEAR).toBe('Od roku 950');
    const s = fresh(LAST_949);
    expect(workshopBlocked(s, LAST_949, plain, 'minter')).toBe(MINT_YEAR);
    expect(workshopBlocked(s, FIRST_950, plain, 'minter')).toBeNull();
  });

  it('startWorkshop odmítne mincovnu před rokem 950 i bez krajiny', () => {
    const pos = { x: 40, z: 0, rotation: 0 };
    const rich = (day: number): VillageState => {
      const s = fresh(day);
      s.storesKg = 50_000;
      return s;
    };
    expect(() => startWorkshop(rich(LAST_949), LAST_949, 'minter', pos, 0)).toThrow(MINT_YEAR);
    expect(() => startWorkshop(rich(FIRST_950), FIRST_950, 'minter', pos, 0)).not.toThrow(
      MINT_YEAR,
    );
  });

  it('applyBuildIntent odmítne mincovnu 31. 12. 949 a rýžovník bez náplavu', () => {
    const s = fresh(LAST_949);
    const pos = { x: 40, z: 0, rotation: 0 };
    const mint = applyBuildIntent(s, LAST_949, gold, obstaclesOf(gold), {
      kind: 'workshop',
      craft: 'minter',
      position: pos,
    });
    expect(mint).toEqual({ ok: false, reason: MINT_YEAR });
    const panner = applyBuildIntent(s, LAST_949, plain, obstaclesOf(plain), {
      kind: 'workshop',
      craft: 'panner',
      position: pos,
    });
    expect(panner).toEqual({ ok: false, reason: PANNER_NO_PLACER });
  });
});
