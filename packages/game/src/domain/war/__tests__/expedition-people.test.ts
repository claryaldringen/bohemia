import { describe, expect, it } from 'vitest';
import { horse, horseVillage, START, YEAR } from '../../village/__tests__/horse-fixtures';
import { villageHappiness } from '../../village/people/happiness';
import type { Person, VillageState } from '../../village/types';
import { sendAway } from '../../vassalage';
import { expeditionRecruit } from '../expedition-people';
import type { JourneyRecruit } from '../journey-types';
import { JOURNEY } from '../rules-war';
import { lineManStrength, villagerStrength } from '../strength';

// Kdo smí na výpravu a s čím jde (expeditions.md – Kdo smí jít; plán 2026-11-14 – Rozhodnutí 8,
// Úloha 5): věk od 12 let, raněný, tažení a jiná nepřítomnost; síla a kůň rekruta.

/**
 * Dvorec: vojvoda Bořivoj 10 (40), žena 11, syn Radim 12 (17, na vlastním koni 1), snacha 13 (16),
 * syn 14 (11); vesničané 20 (muž 26), 21 (žena 27), 22 (muž 28), 23 (žena 29).
 */
function lhota(): VillageState {
  const s = horseVillage([{ ...horse(1, 6), riderId: 12 }, horse(2, 1)], 1, 4);
  for (const p of s.people) if (p.id === 10 || p.id === 12 || p.id === 14) p.line = true;
  person(s, 10).name = 'Bořivoj';
  person(s, 12).name = 'Radim';
  person(s, 12).arms = { bow: 20, combat: 60, riding: 40, best: {} } as never;
  s.dynasty = { lordId: 10, lords: [] };
  return s;
}

function person(s: VillageState, id: number): Person {
  return s.people.find((p) => p.id === id)!;
}

function recruit(s: VillageState, id: number): JourneyRecruit {
  const r = expeditionRecruit(s, person(s, id), START);
  if (typeof r === 'string') throw new Error(`odmítnut: ${r}`);
  return r;
}

describe('expeditionRecruit', () => {
  it('od 12 let: dítě 11 let → young, 12 let → rekrut se silou 0', () => {
    const s = lhota();
    expect(JOURNEY.minAge).toBe(12);
    expect(expeditionRecruit(s, person(s, 14), START)).toBe('young');
    person(s, 14).bornDay = START - Math.ceil(12 * YEAR) - 10;
    expect(recruit(s, 14)).toMatchObject({ ref: { personId: 14 }, lord: false, strength: 0 });
    expect(recruit(s, 14).horseId).toBeUndefined();
  });

  it('raněný → wounded, na tažení → campaign, robota → away', () => {
    const s = lhota();
    person(s, 20).woundedUntil = START + 3;
    sendAway(s, START, [22], { kind: 'campaign', refId: 'c1' });
    sendAway(s, START, [21], { kind: 'labor', untilDay: START + 9 });
    expect(expeditionRecruit(s, person(s, 20), START)).toBe('wounded');
    expect(expeditionRecruit(s, person(s, 22), START)).toBe('campaign');
    expect(expeditionRecruit(s, person(s, 21), START)).toBe('away');
    // robota skončila – zase doma a smí jít
    expect(typeof expeditionRecruit(s, person(s, 21), START + 9)).toBe('object');
  });

  it('syn s koněm: horseId a síla na koni nad silou pěšky; boj, jméno a narození', () => {
    const s = lhota();
    const son = recruit(s, 12);
    const horse1 = s.pens![0]!.horses!.find((h) => h.id === 1)!;
    expect(son).toMatchObject({
      lord: false,
      fight: 60,
      name: 'Radim',
      bornDay: person(s, 12).bornDay,
      horseId: 1,
      strength: lineManStrength(person(s, 12), null),
      strengthMounted: lineManStrength(person(s, 12), horse1),
    });
    expect(son.strengthMounted!).toBeGreaterThan(son.strength);
    expect(son.female).toBeUndefined();
    // id vsi stav nezná – doplní volající
    expect(expeditionRecruit(s, person(s, 12), START, 'lhota')).toMatchObject({
      ref: { villageId: 'lhota', personId: 12 },
    });
  });

  it('vojvoda lord, vesničan od 16 podle štěstí vsi, žena a dítě 0, kůň jen jezdecký', () => {
    const s = lhota();
    expect(recruit(s, 10)).toMatchObject({ lord: true, name: 'Bořivoj', fight: 0 });
    expect(recruit(s, 10).horseId).toBeUndefined();
    expect(recruit(s, 20).strength).toBe(villagerStrength(false, villageHappiness(s)));
    expect(recruit(s, 21)).toMatchObject({ strength: 0, female: true });
    expect(recruit(s, 13)).toMatchObject({ strength: 0, female: true });
    // hříbě s jezdcem není jezdecký kůň
    s.pens![0]!.horses!.find((h) => h.id === 2)!.riderId = 10;
    expect(recruit(s, 10).horseId).toBeUndefined();
  });
});
