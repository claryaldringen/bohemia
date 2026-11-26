import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundField, foundVillage } from '../../core/actions';
import { BUILD_COSTS, workshopBuildCost } from '../../buildings/costs';
import { NO_CRAFTS } from '../../core/productivity';
import { advanceVillage } from '../../core/simulate';
import { CRAFT_BASE, CRAFTS, workshopCost } from '../../rules/rules-crafts';
import { STEWARD_CRAFTS } from '../../rules/rules-steward';
import { workshopValue } from '../../steward/steward';
import type { Craft, Person, VillageState } from '../../types';
import { withBuiltFirstDwelling, withoutSmallGame } from '../../__tests__/village-fixtures';
import { restingCrafters, newWorkshop } from '../crafts';
import { GOLD_CRAFTS } from '../gold-crafts';

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
    expect(workshop.activity).toBe('resting');
  });

  it.each(GOLD_CRAFTS)('%s: domácnost pracuje se vsí (resting)', (craft) => {
    const s = villageWith(craft);
    const resting = restingCrafters(s, DAY, NO_CRAFTS);
    expect(resting.get(WORKSHOP_ID)).toBe('resting');
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
