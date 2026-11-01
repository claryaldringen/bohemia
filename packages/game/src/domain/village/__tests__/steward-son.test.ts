import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { obstaclesOf, tileCenterWorld } from '../../landscape';
import { deriveSeed } from '../../landscape/random';
import { isVillageTravelling, settlersOf, travellingVillage } from '../departure';
import { foundedState } from '../founding';
import { villageTerritory } from '../steward-land';
import { markNewborn } from '../dynasty';
import { suggestVillageName } from '../names';
import { STEWARD } from '../rules-steward';
import { advanceVillage } from '../simulate';
import { departWithSon } from '../son-departure';
import { newSteward } from '../steward-state';
import {
  departingSon,
  nameStewardSons,
  pendingStewardDepartures,
  settleStewardDeparture,
  stewardArrival,
  stewardCrowded,
  stewardDeparture,
  stewardFieldRoom,
  stewardSonDay,
} from '../steward-son';
import { craftCoverage } from '../crafts';
import { averageRotationShare } from '../field-capacity';
import type { Dwelling, FieldPart, Person, VillageState } from '../types';
import { DAY, kin, trackedVillage, type KinSpec } from './kin-fixtures';
import { makeLandscape } from './placement-fixtures';

const pond = (x: number, y: number): boolean => Math.abs(x - 64) <= 1 && Math.abs(y - 70) <= 1;
/** Rovina s tůní; `fertility` 0 – žádné políčko neuživí víc, než sní ten, kdo ho dělá. */
const land = (fertility: number): ReturnType<typeof makeLandscape> =>
  makeLandscape({
    size: 128,
    surface: (x, y) => (pond(x, y) ? 'water' : 'meadow'),
    height: (x, y) => (pond(x, y) ? 0 : 5),
    fertility: () => fertility,
  });
const barren = land(0);
const barrenObstacles = obstaclesOf(barren);
const fertile = land(60);
const fertileObstacles = obstaclesOf(fertile);

/** 31. 8. roku po `DAY` a den předem jako začátek vsi. */
const year = dateOfDayIndex(DAY).year + 1;
const AUG31 = dayIndexOf({ year, month: 8, day: 31 });

const at = (id: number, x: number, z: number): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});

const household = (first: number, size: number, home: number): KinSpec[] =>
  Array.from({ length: size }, (_, i) => ({
    id: first + i,
    age: 30 - i,
    sex: i % 2 === 0 ? 'male' : 'female',
    home,
  }));

/**
 * Vojvoda 10 s ženou 11 v dvorci 1, nástupce 20 (dům 2), ženatý Bořivoj 30 (dům 3), svobodný
 * Dobromil 40 (dům 3) a dvě domácnosti – 16 lidí, žádné pole. Den vsi = `day`.
 */
function lordVillage(day = AUG31 - 2, on = true): VillageState {
  const s = trackedVillage(
    [
      { id: 10, age: 60, sex: 'male', spouse: 11 },
      { id: 11, age: 55, sex: 'female', spouse: 10 },
      { id: 20, age: 30, sex: 'male', spouse: 21, father: 10, mother: 11, home: 2 },
      { id: 21, age: 28, sex: 'female', spouse: 20, home: 2 },
      { id: 30, age: 24, sex: 'male', spouse: 31, father: 10, mother: 11, home: 3 },
      { id: 31, age: 22, sex: 'female', spouse: 30, home: 3 },
      { id: 40, age: 26, sex: 'male', father: 10, mother: 11, home: 3 },
      ...household(50, 4, 4),
      ...household(60, 5, 5),
    ],
    [at(1, 0, 0), at(2, 40, 0), at(3, 0, 40), at(4, -40, 0), at(5, 0, -40)],
    { storesKg: 4000, steward: newSteward(day, on) },
  );
  const names: Record<number, string> = { 20: 'Bořek', 30: 'Bořivoj', 40: 'Dobromil' };
  for (const p of s.people) {
    if (p.id === 20) p.mainWifeSon = true;
    if (names[p.id] !== undefined) p.name = names[p.id];
  }
  s.lastDay = day;
  return s;
}

const json = (s: VillageState): string => JSON.stringify(s);

describe('jména synů (krok 1)', () => {
  const newborn = (s: VillageState): Person => {
    const child: Person = { ...kin({ id: 500, age: 0, sex: 'male', father: 10, mother: 11 }) };
    child.bornDay = s.lastDay;
    s.people.push(child);
    return child;
  };

  it('syn vojvody dostane jméno při narození jen se zapnutým správcem', () => {
    const on = lordVillage();
    const child = newborn(on);
    expect(markNewborn(on, child, on.lastDay)).toEqual([{ day: on.lastDay, kind: 'line-birth' }]);
    expect(child.name).toBeDefined();
    expect(['Bořek', 'Bořivoj', 'Dobromil']).not.toContain(child.name);

    const off = lordVillage(AUG31 - 2, false);
    const other = newborn(off);
    markNewborn(off, other, off.lastDay);
    expect(other.name).toBeUndefined();
  });

  it('syn bez jména z doby před zapnutím ho dostane v den správce – každý jiné', () => {
    const s = lordVillage();
    for (const p of s.people) if (p.id === 30 || p.id === 40) delete p.name;
    const day = Math.ceil(s.lastDay / STEWARD.everyDays) * STEWARD.everyDays;
    stewardSonDay(s, day + 1, null, null);
    expect(s.people.find((p) => p.id === 30)!.name).toBeUndefined();
    stewardSonDay(s, day, null, null);
    const a = s.people.find((p) => p.id === 30)!.name;
    const b = s.people.find((p) => p.id === 40)!.name;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    // jméno je trvalé
    nameStewardSons(s, day + 10);
    expect(s.people.find((p) => p.id === 30)!.name).toBe(a);
  });
});

describe('odchod syna (krok 2)', () => {
  it('31. 8. v přelidněné vsi bez místa na pole odejde nejstarší ženatý syn do schránky', () => {
    const s = lordVillage();
    expect(departingSon(s, AUG31)?.id).toBe(30);
    expect(stewardFieldRoom(s, AUG31, barren, barrenObstacles)).toBe(false);
    const before = s.people.length;
    expect(stewardDeparture(s, AUG31, barren, barrenObstacles)).toBe(true);
    const [record] = s.steward?.departures ?? [];
    expect(record).toBeDefined();
    const seed = deriveSeed(s.seed, `steward-son:${AUG31}`);
    expect(record).toMatchObject({ id: AUG31, sonId: 30, seed, name: suggestVillageName(seed) });
    // jedna ves, jedna mapa – směry všech osm, první bez stezky nejkratší
    expect(record?.directions).toHaveLength(8);
    expect(record?.settlers?.lordId).toBe(30);
    expect(record?.settlers?.stewarded).toBe(true);
    expect(s.people.length).toBe(before - (record?.settlers?.people.length ?? 0));
    expect(s.people.some((p) => p.id === 30)).toBe(false);
    expect(s.lastDay).toBe(AUG31 - 2);
    expect(s.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'son-left-village', name: 'Bořivoj', village: record?.name }),
    );
    expect(pendingStewardDepartures(s)).toHaveLength(1);
    // plán mateřské vsi se přepočítá (menší ves, uvolněné domy)
    expect(s.steward?.replan).toBe(true);
  });

  it('jindy než 31. 8., s vypnutým správcem, s místem na pole nebo bez syna nikdo neodejde', () => {
    const s = lordVillage();
    expect(stewardDeparture(s, AUG31 - 1, barren, barrenObstacles)).toBe(false);
    const off = lordVillage(AUG31 - 2, false);
    expect(stewardDeparture(off, AUG31, barren, barrenObstacles)).toBe(false);
    const room = lordVillage();
    expect(stewardFieldRoom(room, AUG31, fertile, fertileObstacles)).toBe(true);
    expect(stewardDeparture(room, AUG31, fertile, fertileObstacles)).toBe(false);
    const sonless = lordVillage();
    sonless.people = sonless.people.filter((p) => p.id !== 30 && p.id !== 40);
    expect(stewardDeparture(sonless, AUG31, barren, barrenObstacles)).toBe(false);
    expect(s.steward?.departures ?? []).toHaveLength(0);
  });

  /** Ves s polem 40 ha – „Pole uživí“ stačí (není přelidněná). */
  const withFields = (s: VillageState): VillageState => {
    const part: FieldPart = {
      id: 900,
      fieldId: 901,
      areaM2: 400_000,
      distanceM: 50,
      naturalFertility: 60,
      fertilityShare: averageRotationShare(),
      bonusUntilDay: null,
      state: 'fallow',
      sownYears: 0,
      fallowSinceDay: null,
      foundingCost: 0,
      foundingDone: 0,
      surface: 'meadow',
    };
    s.parts.push(part);
    return s;
  };

  it('past osiva: ves s dost poli, která hladověla, pošle syna i s místem na pole', () => {
    const trapped = withFields(lordVillage());
    expect(stewardCrowded(trapped, AUG31, craftCoverage(trapped, AUG31))).toBe(false);
    expect(stewardFieldRoom(trapped, AUG31, fertile, fertileObstacles)).toBe(true);
    trapped.steward!.hungerPeak = STEWARD.departureHungerDays;
    expect(stewardDeparture(trapped, AUG31, fertile, fertileObstacles)).toBe(true);
    // hlad pod prahem, nebo bez hladu – nic
    const mild = withFields(lordVillage());
    mild.steward!.hungerPeak = STEWARD.departureHungerDays - 1;
    expect(stewardDeparture(mild, AUG31, fertile, fertileObstacles)).toBe(false);
    expect(stewardDeparture(withFields(lordVillage()), AUG31, fertile, fertileObstacles)).toBe(
      false,
    );
    // přelidněná a hladová ves s místem na pole – napřed pole
    const crowded = lordVillage();
    crowded.steward!.hungerPeak = 30;
    expect(stewardDeparture(crowded, AUG31, fertile, fertileObstacles)).toBe(false);
    // … ale hladověla-li už loni, pole navíc rok nepomohla – syn odejde i s místem
    const again = lordVillage();
    again.steward!.hungerPeak = 30;
    again.steward!.lastYearHunger = STEWARD.departureHungerDays;
    expect(stewardFieldRoom(again, AUG31, fertile, fertileObstacles)).toBe(true);
    expect(stewardDeparture(again, AUG31, fertile, fertileObstacles)).toBe(true);
    // loni hladověla, letos ne – nic
    const recovered = lordVillage();
    recovered.steward!.lastYearHunger = 30;
    expect(stewardDeparture(recovered, AUG31, fertile, fertileObstacles)).toBe(false);
  });

  it('hlad se pamatuje od jednoho 31. 8. k dalšímu – jen nejvyšší', () => {
    const s = withFields(lordVillage(AUG31 - 3));
    s.starvationDays = 9;
    stewardSonDay(s, AUG31 - 2, fertile, fertileObstacles);
    s.starvationDays = 4;
    stewardSonDay(s, AUG31 - 1, fertile, fertileObstacles);
    expect(s.steward?.hungerPeak).toBe(9);
    s.starvationDays = 0;
    stewardSonDay(s, AUG31, fertile, fertileObstacles);
    expect(s.steward?.departures).toHaveLength(1);
    expect(s.steward?.hungerPeak).toBeUndefined();
    // loňský hlad zůstane na příští rok; rok bez hladu ho smaže
    expect(s.steward?.lastYearHunger).toBe(9);
    stewardSonDay(s, dayIndexOf({ year: year + 1, month: 8, day: 31 }), fertile, fertileObstacles);
    expect(s.steward?.lastYearHunger).toBeUndefined();
  });

  it('svobodný syn odejde, když ženatý není', () => {
    const s = lordVillage();
    s.people = s.people.filter((p) => p.id !== 30 && p.id !== 31);
    expect(departingSon(s, AUG31)?.id).toBe(40);
  });

  it('jedna ves, jedna mapa – syn jde vždy na novou mapu, i s úrodnou mapou kolem', () => {
    const s = withFields(lordVillage());
    s.steward!.hungerPeak = STEWARD.departureHungerDays;
    expect(stewardDeparture(s, AUG31, fertile, fertileObstacles)).toBe(true);
    const [record] = s.steward?.departures ?? [];
    expect(record && 'dwelling' in record).toBe(false);
    expect(record?.directions).toHaveLength(8);
  });

  it('v simulaci nejvýš jeden odchod za rok a výsledek nezávisí na kouscích dopočtu', () => {
    const start = lordVillage(AUG31 - 3);
    const end = AUG31 + 3;
    const whole = advanceVillage(start, end, barrenObstacles, barren);
    expect(whole.steward?.departures?.map((d) => d.id)).toEqual([AUG31]);
    // hrana kousku na dni odchodu, den před ním a kousky po dni
    const edge = advanceVillage(
      advanceVillage(start, AUG31, barrenObstacles, barren),
      end,
      barrenObstacles,
      barren,
    );
    const before = advanceVillage(
      advanceVillage(start, AUG31 - 1, barrenObstacles, barren),
      end,
      barrenObstacles,
      barren,
    );
    let daily = start;
    for (let d = start.lastDay + 1; d <= end; d++)
      daily = advanceVillage(daily, d, barrenObstacles, barren);
    expect(json(edge)).toBe(json(whole));
    expect(json(before)).toBe(json(whole));
    expect(json(daily)).toBe(json(whole));
    // do dalšího 31. 8. už nikdo další neodejde
    const nextYear = advanceVillage(whole, AUG31 + 364, barrenObstacles, barren);
    expect(nextYear.steward?.departures).toHaveLength(1);
  });

  it('vybavený záznam schránky ztratí osadníky a nese id nové vsi (idempotentně)', () => {
    const s = lordVillage();
    stewardDeparture(s, AUG31, barren, barrenObstacles);
    const settled = settleStewardDeparture(s, AUG31, 'ves-2');
    expect(settled.steward?.departures?.[0]).toMatchObject({ id: AUG31, villageId: 'ves-2' });
    expect(settled.steward?.departures?.[0]?.settlers).toBeUndefined();
    expect(pendingStewardDepartures(settled)).toHaveLength(0);
    expect(settleStewardDeparture(settled, AUG31, 'ves-3')).toBe(settled);
    expect(s.steward?.departures?.[0]?.villageId).toBeUndefined();
  });
});

describe('ves na cestě se správcem (příjezd)', () => {
  /** Syn odejde ze vsi na novou mapu (krajina `fertile`) – ves na cestě 2 dny. */
  function travelling(): VillageState {
    const s = lordVillage(AUG31);
    const departed = departWithSon(s, AUG31, 30, { direction: 'N', villageName: 'Lhota' });
    return travellingVillage(departed.settlers, 777, AUG31, {
      direction: 'N',
      departedDay: AUG31,
      arrivalDay: AUG31 + 2,
    });
  }

  it('po příjezdu se ves založí sama – vojvodou je syn, správce zapnutý', () => {
    const t = travelling();
    expect(stewardArrival(t, AUG31 + 1, fertile, fertileObstacles)).toBeNull();
    const early = advanceVillage(t, AUG31 + 1, fertileObstacles, fertile);
    expect(isVillageTravelling(early)).toBe(true);
    const arrived = advanceVillage(t, AUG31 + 5, fertileObstacles, fertile);
    expect(isVillageTravelling(arrived)).toBe(false);
    expect(arrived.dynasty?.lordId).toBe(30);
    expect(arrived.steward?.on).toBe(true);
    expect(arrived.foundedDay).toBe(AUG31 + 2);
    expect(arrived.constructions.length + arrived.dwellings.length).toBeGreaterThan(0);
    const site = fertile.villageSite;
    const c = tileCenterWorld(fertile, site.x, site.y);
    const first = arrived.constructions[0]?.position ?? arrived.dwellings[0]?.position;
    expect(Math.abs(first!.x - c.x) + Math.abs(first!.z - c.z)).toBeLessThan(200);
    // kousky dopočtu: před příjezdem, v den příjezdu
    const chunked = advanceVillage(early, AUG31 + 5, fertileObstacles, fertile);
    const onEdge = advanceVillage(
      advanceVillage(t, AUG31 + 2, fertileObstacles, fertile),
      AUG31 + 5,
      fertileObstacles,
      fertile,
    );
    expect(json(chunked)).toBe(json(arrived));
    expect(json(onEdge)).toBe(json(arrived));
  });

  it('ves na cestě, kde hráč správce vypnul, čeká na hráče a po založení zůstane vypnutá', () => {
    const t = travelling();
    t.steward!.on = false;
    t.steward!.sinceDay = AUG31 + 1;
    expect(isVillageTravelling(advanceVillage(t, AUG31 + 5, fertileObstacles, fertile))).toBe(true);
    expect(settlersOf(t).stewarded).toBeUndefined();
    const founded = foundedState(
      t.seed,
      {
        landscape: fertile,
        obstacles: fertileObstacles,
        today: AUG31 + 2,
        dwelling: { x: 0, z: 0, rotation: 0 },
        settlers: settlersOf(t),
      },
      undefined,
      null,
    );
    expect(founded.ok && founded.state.steward?.on).toBe(false);
  });

  it('stěhování celé vsi: správce zapnutý cestou ves po příjezdu založí a zůstane zapnutý', () => {
    const t = travelling();
    delete t.journey!.stewarded;
    t.steward!.on = false;
    // bez správce čeká
    expect(isVillageTravelling(advanceVillage(t, AUG31 + 5, fertileObstacles, fertile))).toBe(true);
    // hráč ho cestou zapne
    t.steward!.on = true;
    t.steward!.sinceDay = AUG31 + 1;
    expect(settlersOf(t).stewarded).toBe(true);
    const arrived = advanceVillage(t, AUG31 + 5, fertileObstacles, fertile);
    expect(isVillageTravelling(arrived)).toBe(false);
    expect(arrived.steward?.on).toBe(true);
  });
});

describe('úklid značek správce (S2)', () => {
  it('31. 8. ze steward.built zmizí id, která ve stavu nejsou; idempotentně', () => {
    const s = lordVillage();
    s.steward!.built = [1, 2, 999, 12345];
    stewardSonDay(s, AUG31, null, null);
    expect(s.steward!.built).toEqual([1, 2]);
    const again = JSON.stringify(s.steward!.built);
    stewardSonDay(s, AUG31, null, null);
    expect(JSON.stringify(s.steward!.built)).toBe(again);
  });
});

describe('území vsi (jedna ves, jedna mapa)', () => {
  it('záznam schránky území vsi nezmenší – syn jde na novou mapu', () => {
    const s = lordVillage();
    const before = villageTerritory(s, fertile).reduce((a, b) => a + b, 0);
    expect(before).toBeGreaterThan(0);
    s.steward!.departures = [{ id: AUG31, sonId: 30, seed: 1, name: 'Lhota', directions: [] }];
    expect(villageTerritory(s, fertile).reduce((a, b) => a + b, 0)).toBe(before);
  });
});
