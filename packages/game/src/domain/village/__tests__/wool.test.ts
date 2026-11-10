import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { happinessFactors } from '../happiness';
import { PLAN_HAY_KEEP, winterHayKg } from '../hay';
import { LIVESTOCK, slaughter, winterTargets } from '../livestock';
import { WOOL } from '../rules';
import { advanceVillage } from '../simulate';
import type { HerdSpecies, VillageState } from '../types';
import { recordWool, woolCoverage, woolNeedKg, woolSheep, woolUnhappiness } from '../wool';
import { withBuiltFirstDwelling, withRoomyPens } from './village-fixtures';

// Oděv – vlna (diet.md – Oděv; Martin 19. 10. 2026: „Ovce jsou hlavně kvůli vlně, aby se lidé
// mohli vůbec oblékat.“): ovce na vlnu pro všechny jsou spodní hranicí stáda.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day = at(600, 9, 2)): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  return s;
}

describe('vlna na oděv', () => {
  it('dospělý 1,6 kg, dítě 0,8 kg surové vlny za rok; ovce dá 0,8 kg', () => {
    const s = village();
    const day = s.lastDay;
    const adults = s.people.filter((p) => day - p.bornDay >= 14 * 365).length;
    const children = s.people.length - adults;
    expect(woolNeedKg(s, day)).toBeCloseTo(
      adults * WOOL.kgPerYear.adult + children * WOOL.kgPerYear.child,
      9,
    );
    expect(woolSheep(s, day)).toBeCloseTo(woolNeedKg(s, day) / WOOL.kgPerSheep, 9);
    // dospělý potřebuje 2 ovce, dítě 1 – ves ≈ 1–2 ovce na člověka
    expect(WOOL.kgPerYear.adult / WOOL.kgPerSheep).toBe(2);
    expect(WOOL.kgPerYear.child / WOOL.kgPerSheep).toBe(1);
  });

  it('osadníci nové vsi mají ovcí na vlnu pro všechny a seno na první zimu', () => {
    const s = village();
    expect(s.livestock!.herds.sheep).toBeGreaterThanOrEqual(woolSheep(s, s.lastDay));
    expect(s.hay?.kg).toBeCloseTo(winterHayKg(s.livestock!.herds, 0) / PLAN_HAY_KEEP, 9);
    // ves založená na podzim přezimuje i s ovcemi na vlnu – když má ohradu ovcí (oxen.md – Ohrady
    // podle druhu)
    const autumn = withRoomyPens(
      withBuiltFirstDwelling(
        foundVillage({
          seed: 7,
          day: at(600, 10, 1),
          dwellingPosition: { x: 0, z: 0, rotation: 0 },
        }),
      ),
    );
    const spring = advanceVillage(autumn, at(601, 3, 2), null);
    expect(spring.livestock!.herds.sheep).toBeGreaterThan(woolSheep(spring, spring.lastDay) - 1);
    expect(spring.chronicle.some((e) => e.kind === 'wool-short')).toBe(false);
    // bez ohrady ovcí: první rok odklad (oxen.md – Ohrady podle druhu) – ovce zůstanou; po něm si
    // domácnost u domu nechá jen pár ovcí a vlna chybí
    const bare = withBuiltFirstDwelling(
      foundVillage({ seed: 7, day: at(600, 10, 1), dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    const bareSpring = advanceVillage(bare, at(601, 3, 2), null);
    expect(bareSpring.chronicle.some((e) => e.kind === 'wool-short')).toBe(false);
    const later = advanceVillage(bareSpring, at(602, 3, 2), null);
    expect(later.livestock!.herds.sheep).toBeLessThan(woolSheep(later, later.lastDay));
    expect(later.chronicle.some((e) => e.kind === 'wool-short')).toBe(true);
  });

  it('maso navíc z mláďat nejde z ovcí na vlnu', () => {
    const day = at(600, 11, 1);
    const s = village(day);
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.livestock!.herds = herds({ sheep: 8, pig: 2, cow: 2 });
    s.livestock!.young = herds({ sheep: 3 });
    s.meatKg = 0;
    slaughter(s, day, { oxen: 0, hayKg: Infinity, minSheep: 8 });
    expect(s.livestock!.herds.sheep).toBeCloseTo(8, 9);
  });

  it('pastva a seno napřed kravám, pak ovcím – i ovcím na vlnu (24. 10. 2026)', () => {
    const s = village(at(600, 11, 1));
    const day = s.lastDay;
    s.livestock!.herds = herds({ sheep: 20, cow: 6 });
    // pastva na 4 krávy a 10 ovcí (ovce 0,2 ha, kráva 1 ha), seno dost
    s.livestock!.land = {
      meadowHa: 4 * LIVESTOCK.pastureHa.cow + 10 * LIVESTOCK.pastureHa.sheep,
      forestHa: 0,
    };
    const wool = winterTargets(s, day, { oxen: 0, hayKg: Infinity, minCows: 4, minSheep: 20 });
    // krávy mají přednost (oxen.md – Co nejvíc sena a co největší stáda) – ovce na vlnu nepomůžou
    expect(wool.cow).toBeCloseTo(6, 9);
    expect(wool.sheep).toBeCloseTo(LIVESTOCK.breedingMin, 9);
  });

  it('pasáci hlídají napřed ovce, pak prasata – ovce na vlnu nic nemění (24. 10. 2026)', () => {
    const s = village(at(600, 11, 1));
    const day = s.lastDay;
    s.livestock!.herds = herds({ sheep: 20, pig: 20 });
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    // pasáci uhlídali polovinu potřeby (0,6 pasáka): ovce celé (0,2), prasata zbytek (0,1 z 0,4)
    const plain = winterTargets(s, day, { oxen: 0, hayKg: Infinity, herding: 0.5 });
    const wool = winterTargets(s, day, { oxen: 0, hayKg: Infinity, herding: 0.5, minSheep: 15 });
    expect(plain.sheep).toBeCloseTo(20, 9);
    expect(plain.pig).toBeCloseTo(5, 9);
    expect(wool).toEqual(plain);
  });

  it('chybí-li ovce, porážka zapíše nedostatek vlny – štěstí ubere až 6', () => {
    const s = village(at(600, 11, 1));
    s.livestock!.herds = herds({ sheep: 3, pig: 2, cow: 1 });
    const event = recordWool(s, s.livestock!, s.lastDay);
    const needed = woolSheep(s, s.lastDay);
    expect(event).toEqual({
      day: s.lastDay,
      kind: 'wool-short',
      sheep: 3,
      needed: Math.ceil(needed),
    });
    expect(woolCoverage(s)).toBeCloseTo(3 / needed, 9);
    expect(woolUnhappiness(s)).toBeCloseTo(WOOL.unhappiness * (1 - 3 / needed), 9);
    expect(happinessFactors(s, s.lastDay, 1).wool).toBeCloseTo(woolUnhappiness(s), 9);
    // ovcí dost – bez události, bez ztráty štěstí
    s.livestock!.herds.sheep = needed + 1;
    expect(recordWool(s, s.livestock!, s.lastDay)).toBeNull();
    expect(woolUnhappiness(s)).toBe(0);
  });

  it('starší ves beze změny až do porážky 1. 11.; pak ovce na vlnu nechá', () => {
    // ohrada ovcí – ovce na vlnu se do ní vejdou (oxen.md – Ohrady podle druhu)
    const s = withRoomyPens(village(at(600, 9, 2)));
    s.livestock!.herds = herds({ sheep: 3, goat: 1, pig: 2, cow: 1 });
    s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
    s.hay = { kg: 100_000, mowing: null };
    const before = advanceVillage(s, at(600, 10, 31), null);
    expect(before.livestock!.wool).toBeUndefined();
    expect(happinessFactors(before, before.lastDay, 1).wool).toBe(0);
    const after = advanceVillage(before, at(600, 11, 2), null);
    expect(after.livestock!.wool).toBeDefined();
    // stádo menší než hranice – na maso ovce nejdou
    expect(after.chronicle.some((e) => e.kind === 'wool-short')).toBe(true);
    const slaughter = after.chronicle.find((e) => e.kind === 'slaughter');
    if (slaughter && slaughter.kind === 'slaughter') {
      expect(slaughter.animals?.sheep ?? 0).toBe(0);
    }
  });

  it('výsledek nezávisí na tom, po jakých kouscích se dopočítává', () => {
    const s = village(at(600, 3, 1));
    s.livestock!.herds = herds({ sheep: 3, goat: 1, pig: 2, cow: 1 });
    const whole = advanceVillage(s, at(602, 3, 1), null);
    let chunked = s;
    for (let d = s.lastDay + 41; d < at(602, 3, 1); d += 41)
      chunked = advanceVillage(chunked, d, null);
    chunked = advanceVillage(chunked, at(602, 3, 1), null);
    expect(chunked.livestock).toEqual(whole.livestock);
    expect(chunked.happiness).toEqual(whole.happiness);
    expect(chunked.chronicle).toEqual(whole.chronicle);
  });
});
