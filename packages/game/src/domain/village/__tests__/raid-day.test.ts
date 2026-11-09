import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import type { VillageEvent, VillageEventBody } from '../inbox';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import { withBuiltFirstDwelling } from './village-fixtures';

// Den nájezdu a posel (war.md – Ves během nájezdu nepracuje, Obránci – Kdy; plán 2026-11-03 –
// Úloha 6.7): schránka `raid-day` zastaví práci vsi na ten den, `army-seen` zapíše posla.

const FOUNDED = 200;

function village(): VillageState {
  return withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
}

const event = (seq: number, day: number, body: VillageEventBody): VillageEvent => ({
  id: `e${seq}`,
  villageId: 'v1',
  day,
  seq,
  body,
});

/** Odpracované člověkodny vsi v den `day` (dopočet po jednom dni – rozdělení práce dne). */
function manDaysOn(state: VillageState, day: number, inbox: readonly VillageEvent[]): number {
  const next = advanceVillage(state, day, null, null, inbox);
  expect(next.labor?.day).toBe(day);
  return (next.labor?.shares ?? []).reduce((sum, s) => sum + s.manDays, 0);
}

describe('den nájezdu (raid-day)', () => {
  it('ves v den nájezdu nepracuje, den po odchodu vojska pracuje', () => {
    const start = advanceVillage(village(), FOUNDED + 20, null, null);
    const raid = [
      event(1, FOUNDED + 21, { kind: 'raid-day', campaignId: 'c1' }),
      event(2, FOUNDED + 22, { kind: 'raid-day', campaignId: 'c1' }),
    ];
    const day21 = manDaysOn(start, FOUNDED + 21, raid);
    const quiet21 = manDaysOn(start, FOUNDED + 21, []);
    expect(quiet21).toBeGreaterThan(0);
    expect(day21).toBe(0);
    const after22 = advanceVillage(start, FOUNDED + 22, null, null, raid);
    expect(after22.raidDay).toBe(FOUNDED + 22);
    expect(manDaysOn(after22, FOUNDED + 23, raid)).toBeGreaterThan(0);
  });

  it('výsledek nezávisí na kouscích dopočtu', () => {
    const raid = [event(1, FOUNDED + 5, { kind: 'raid-day', campaignId: 'c1' })];
    const whole = advanceVillage(village(), FOUNDED + 9, null, null, raid);
    let pieces = village();
    for (const to of [FOUNDED + 4, FOUNDED + 5, FOUNDED + 9]) {
      pieces = advanceVillage(pieces, to, null, null, raid);
    }
    expect(JSON.stringify(pieces)).toBe(JSON.stringify(whole));
  });
});

describe('posel (army-seen)', () => {
  // war.md – Varování, 9. 11. 2026: tažení `army-seen` už neposílá (posla posílá hráč nebo správce –
  // plán 2026-11-09, Úloha 5); ves ho zapíše dál, je-li ještě v nedoručených událostech starého bodu
  it('zapíše posla s tažením a vsí, odkud šel', () => {
    const inbox = [
      event(1, FOUNDED + 3, { kind: 'army-seen', campaignId: 'c1', fromVillageId: 'v2' }),
    ];
    const next = advanceVillage(village(), FOUNDED + 4, null, null, inbox);
    expect(next.armySeen).toEqual({ day: FOUNDED + 3, campaignId: 'c1', fromVillageId: 'v2' });
  });
});
