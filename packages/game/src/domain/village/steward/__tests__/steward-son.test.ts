import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateAcceptedLandscape,
  obstaclesOf,
  tileCenterWorld,
  type Landscape,
  type ObstacleLayer,
} from '../../../landscape';
import { deriveSeed } from '../../../landscape/random';
import { cellLandscapeSeed, skeletonSlice, trailStops } from '../../../world';
import { isVillageTravelling, settlersOf, travellingVillage } from '../../people/departure';
import { foundedState } from '../founding';
import { villageTerritory } from '../steward-land';
import { markNewborn } from '../../people/dynasty';
import { suggestVillageName } from '../../people/names';
import { STEWARD } from '../../rules/rules-steward';
import { migrateVillage, type VillageMigrationContext } from '../../core/migrations';
import { advanceVillage } from '../../core/simulate';
import { departWithSon } from '../../people/son-departure';
import {
  departingSon,
  departureFed,
  nameStewardSons,
  pendingStewardDepartures,
  settleStewardDeparture,
  stewardArrival,
  stewardCrowded,
  stewardDeparture,
  stewardExpedition,
  stewardFieldRoom,
  stewardSonDay,
} from '../steward-son';
import { bufferFill } from '../../fields/field-food';
import { fieldStoresOutlook } from '../../core/simulate-plan';
import { craftCoverage } from '../../crafts/crafts';
import type { VillageEvent } from '../../core/inbox';
import { merchantVisits } from '../../trade/merchant-plan';
import { builtTrail, villageTrails } from '../../trade/trail';
import type { SkeletonSlice } from '../../../landscape/skeleton/types';
import type { GridCell } from '../../people/world-grid';
import type { Direction8, MerchantStop, Person, VillageState } from '../../types';
import { kin } from '../../__tests__/kin-fixtures';
import {
  AUG31,
  barren,
  barrenObstacles,
  fallowPart,
  land,
  lordVillage,
  year,
} from './steward-son-fixtures';

const fertile = land(60);
const fertileObstacles = obstaclesOf(fertile);

const json = (s: VillageState): string => JSON.stringify(s);
const json2 = (s: VillageState): VillageState => JSON.parse(json(s)) as VillageState;

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

  /** Ves s polem 40 ha navíc – „Pole uživí“ stačí (není přelidněná). */
  const withFields = (s: VillageState): VillageState => {
    s.parts.push(fallowPart(900, 400_000));
    return s;
  };

  it('past osiva: ves s dost poli, která hladověla, pošle syna i s místem na pole', () => {
    const trapped = withFields(lordVillage());
    expect(stewardCrowded(trapped, fertile, fertileObstacles)).toBe(false);
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
    // hladová ves hladoví i s místem na pole (past osiva) – syn odejde i při hladu 30 dní
    const crowded = lordVillage();
    crowded.steward!.hungerPeak = 30;
    expect(stewardDeparture(crowded, AUG31, fertile, fertileObstacles)).toBe(true);
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

  const son30 = (s: VillageState): Person => s.people.find((p) => p.id === 30)!;
  /** Pojistka mateřské vsi po odchodu syna `sonId` (jako `departingSon`). */
  const motherFill = (s: VillageState, sonId: number): number => {
    const after = departWithSon({ ...s, lastDay: AUG31 }, AUG31, sonId).state;
    return bufferFill(fieldStoresOutlook(after, AUG31, craftCoverage(after, AUG31)));
  };

  /** Kolikrát osev vlastní prací uživí obě vsi po odchodu syna `sonId` (jako `departingSon`). */
  const fedAfter = (s: VillageState, sonId: number): ReturnType<typeof departureFed> => {
    const { state: after, settlers } = departWithSon({ ...s, lastDay: AUG31 }, AUG31, sonId);
    return departureFed(s, after, settlers, AUG31);
  };

  it('díl pod prahem výpravy – správce syna nepošle a počká; životaschopný díl pošle', () => {
    // bez dcery vojvody (16 ÷ 4 dílníci = 4) by domácnost domu 4 díl od cíle oddálila – Bořivoj by
    // šel jen se ženou: 2 dospělí, ves o dvou lidech
    const small = lordVillage();
    small.people = small.people.filter((p) => p.id !== 12);
    expect(stewardExpedition(small, son30(small), AUG31)).toMatchObject({
      people: 2,
      adults: 2,
      pair: true,
      viable: false,
    });
    expect(departingSon(small, AUG31)).toBeNull();
    expect(stewardCrowded(small, barren, barrenObstacles)).toBe(true);
    expect(stewardDeparture(small, AUG31, barren, barrenObstacles)).toBe(false);
    expect(small.steward?.departures ?? []).toHaveLength(0);
    // s dcerou (17 ÷ 4): Bořivoj, žena a domácnost domu 4 – 6 dospělých s párem, plný náklad
    const ok = lordVillage();
    const e = stewardExpedition(ok, son30(ok), AUG31);
    expect(e).toMatchObject({ people: 6, adults: STEWARD.expeditionAdults + 2, pair: true });
    expect(e?.load).toBeGreaterThanOrEqual(STEWARD.expeditionLoad);
    expect(e?.seed).toBeGreaterThanOrEqual(STEWARD.expeditionLoad);
    expect(e?.viable).toBe(true);
    // bez páru (žena Bořivoje zemřela) díl neprojde, i když dospělých je dost
    const widower = lordVillage();
    widower.people = widower.people.filter((p) => p.id !== 31);
    delete son30(widower).spouseId;
    expect(stewardExpedition(widower, son30(widower), AUG31)?.pair).toBe(false);
  });

  it('bez zásob na náklad výpravy nikdo neodejde a mateřská ves si nechá pojistku', () => {
    // 300 kg – díl zásob výpravy nedá ani polovinu toho, co unesou
    const poor = lordVillage();
    poor.storesKg = 300;
    expect(stewardExpedition(poor, son30(poor), AUG31)?.load).toBeLessThan(STEWARD.expeditionLoad);
    expect(departingSon(poor, AUG31)).toBeNull();
    // 700 kg – výprava by nesla dost, ale mateřské vsi by po odchodu zbylo pod pojistku Nouze
    const thin = lordVillage();
    thin.storesKg = 700;
    expect(stewardExpedition(thin, son30(thin), AUG31)?.viable).toBe(true);
    expect(motherFill(thin, 30)).toBeLessThan(STEWARD.departureMotherFill);
    expect(departingSon(thin, AUG31)).toBeNull();
    // 800 kg – pojistka stačí, ale mateřské vsi nezbude osivo na příští osev (uživí ji osev)
    const seedless = lordVillage();
    seedless.storesKg = 800;
    expect(motherFill(seedless, 30)).toBeGreaterThanOrEqual(STEWARD.departureMotherFill);
    expect(fedAfter(seedless, 30).mother).toBeLessThan(STEWARD.departureFeedShare);
    expect(departingSon(seedless, AUG31)).toBeNull();
    // 4000 kg – vše stačí
    expect(departingSon(lordVillage(), AUG31)?.id).toBe(30);
  });

  it('obě vsi po odchodu uživí své lidi vlastní prací s rezervou – jinak správce počká', () => {
    const s = lordVillage();
    const fed = fedAfter(s, 30);
    expect(fed.mother).toBeGreaterThanOrEqual(STEWARD.departureFeedShare);
    expect(fed.colony).toBeGreaterThanOrEqual(STEWARD.departureFeedShare);
    expect(departingSon(s, AUG31)?.id).toBe(30);
    // mateřská ves bez polí sama nic neoseje – přelidněná, výprava životaschopná, a přesto nic
    const fieldless = lordVillage(AUG31 - 2, true, 0);
    expect(stewardCrowded(fieldless, barren, barrenObstacles)).toBe(true);
    expect(stewardExpedition(fieldless, son30(fieldless), AUG31)?.viable).toBe(true);
    expect(fedAfter(fieldless, 30)).toEqual({ mother: 0, colony: 0 });
    expect(departingSon(fieldless, AUG31)).toBeNull();
    expect(stewardDeparture(fieldless, AUG31, barren, barrenObstacles)).toBe(false);
    // pole skoro bez úrody – osev vlastní prací neuživí ani jednu ves
    const poor = lordVillage();
    poor.parts[0]!.naturalFertility = 2;
    const poorFed = fedAfter(poor, 30);
    expect(poorFed.mother).toBeLessThan(STEWARD.departureFeedShare);
    expect(poorFed.colony).toBeLessThan(STEWARD.departureFeedShare);
    expect(departingSon(poor, AUG31)).toBeNull();
    // nová ves s mnoha dětmi – její 4 páry rukou je neuživí, mateřská ves beze změny
    const { state: after, settlers } = departWithSon({ ...s, lastDay: AUG31 }, AUG31, 30);
    const template = settlers.people[0]!;
    const children = Array.from({ length: 20 }, (_, i): Person => {
      const child: Person = { ...template, id: 1000 + i, bornDay: AUG31 - 5 * 365 };
      delete child.spouseId;
      return child;
    });
    const crowdedColony = departureFed(
      s,
      after,
      { ...settlers, people: [...settlers.people, ...children] },
      AUG31,
    );
    expect(crowdedColony.colony).toBeLessThan(STEWARD.departureFeedShare);
    expect(crowdedColony.mother).toBeCloseTo(fed.mother, 9);
  });

  it('ze způsobilých synů odejde ten s nejživotaschopnějším dílem', () => {
    // Dobromil (dům 3, svobodný) s domácností domu 4 jako pár: 5 dospělých – Bořivoj má 6
    const s = lordVillage();
    for (const [a, b] of [
      [50, 51],
      [51, 50],
    ] as const) {
      const p = s.people.find((x) => x.id === a);
      if (p) p.spouseId = b;
    }
    const dobromil = s.people.find((p) => p.id === 40)!;
    expect(stewardExpedition(s, dobromil, AUG31)?.viable).toBe(true);
    expect(stewardExpedition(s, dobromil, AUG31)?.adults).toBeLessThan(
      stewardExpedition(s, son30(s), AUG31)?.adults ?? 0,
    );
    expect(departingSon(s, AUG31)?.id).toBe(30);
  });

  it('svobodný syn odejde, když ženatý není – s dílem, ve kterém je pár', () => {
    const s = lordVillage();
    s.people = s.people.filter((p) => p.id !== 30 && p.id !== 31);
    // díl Dobromila (15 ÷ 3 dílníci = 5): on a domácnost domu 4 – bez páru správce počká
    expect(departingSon(s, AUG31)).toBeNull();
    for (const [a, b] of [
      [50, 51],
      [51, 50],
    ] as const) {
      const p = s.people.find((x) => x.id === a);
      if (p) p.spouseId = b;
    }
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

/** Mapa políčka se stezkou světa se seedem 1 – výřez a krajina z něj, jakou má sídlo vsi syna. */
function trailMap(cell: GridCell): {
  slice: SkeletonSlice;
  landscape: Landscape;
  obstacles: ObstacleLayer;
} {
  const slice = skeletonSlice(1, cell)!;
  const versions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 as const };
  const seed = cellLandscapeSeed(1, cell);
  const { landscape } = generateAcceptedLandscape(seed, versions, undefined, slice);
  return { slice, landscape, obstacles: obstaclesOf(landscape) };
}

/** Cesty k číslům stavu, která nejsou konečná (NaN, ±∞). */
function nonFinite(value: unknown, path = 'stav'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, v]) => nonFinite(v, `${path}.${key}`));
}

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

  it('křest rodu na cestě i po příjezdu (christianity.md – Křest rodu): vcelku = po kouscích', () => {
    const t = travelling();
    const baptized = (day: number): VillageEvent => ({
      id: `b${day}`,
      villageId: 'v2',
      day,
      seq: day,
      body: { kind: 'rod-baptized', houseId: 'h1', lord: true },
    });
    for (const day of [AUG31 + 1, AUG31 + 3]) {
      const events = [baptized(day)];
      const whole = advanceVillage(t, AUG31 + 5, fertileObstacles, fertile, events);
      expect(whole.faith?.rodBaptizedDay).toBe(day);
      // na cestě se vojvoda nekřtí, po založení ano (ves vojvody rodu)
      const lord = whole.people.find((p) => p.id === whole.dynasty?.lordId);
      expect(lord?.faith === 'christian').toBe(day > AUG31 + 2);
      for (const cut of [AUG31 + 1, AUG31 + 2, AUG31 + 3]) {
        const part = advanceVillage(t, cut, fertileObstacles, fertile, events);
        const rest = advanceVillage(json2(part), AUG31 + 5, fertileObstacles, fertile, events);
        expect(json(rest)).toBe(json(whole));
      }
    }
  });

  it('zastávky kupců nové mapy přejdou příjezdem do založené vsi (markets.md, Rozhodnutí plánu 4, bod 5)', () => {
    const stops: MerchantStop[] = [{ key: '0,0,E', seed: 7, index: 0, length: 1 }];
    const t = travelling();
    const without = stewardArrival(t, AUG31 + 2, fertile, fertileObstacles)!;
    expect(without).not.toHaveProperty('merchantStops');
    expect(
      stewardArrival({ ...t, merchantStops: stops }, AUG31 + 2, fertile, fertileObstacles),
    ).toStrictEqual({ ...without, merchantStops: stops });
    // mapa bez stezky zůstane zjištěná (`[]`)
    expect(
      stewardArrival({ ...t, merchantStops: [] }, AUG31 + 2, fertile, fertileObstacles),
    ).toStrictEqual({ ...without, merchantStops: [] });
  });

  it('kupci po příjezdu uvnitř dopočtu: 200 dní vcelku = po kouscích s načtením mezi nimi', () => {
    const stops: MerchantStop[] = [{ key: '0,0,E', seed: 7, index: 0, length: 1 }];
    const end = AUG31 + 200;
    const load: VillageMigrationContext = {
      obstacles: fertileObstacles,
      landscape: fertile,
      load: {
        today: end,
        weatherSeed: 99,
        merchantStops: stops,
        landscape: fertile,
        obstacles: fertileObstacles,
      },
    };
    const start = migrateVillage({ ...travelling(), merchantStops: stops }, load);
    const whole = advanceVillage(start, end, fertileObstacles, fertile);
    expect(whole.foundedDay).toBe(AUG31 + 2);
    expect(whole.people.length).toBeGreaterThan(0);
    expect(whole.merchantStops).toEqual(stops);
    // kupci přijeli po příjezdu vsi v obou polovinách
    const planned = merchantVisits(stops, AUG31 + 2, end).map((visit) => visit.day);
    const [first] = planned;
    expect(first).toBeLessThan(AUG31 + 100);
    expect(planned.at(-1)).toBeGreaterThan(AUG31 + 100);
    const arrivals = (s: VillageState): number[] =>
      s.chronicle.filter((e) => e.kind === 'merchants-arrived').map((e) => e.day);
    const notes = (whole.market?.arrivals ?? []).filter((a) => a.merchants).map((a) => a.day);
    expect(notes).toEqual(planned);
    // v kronice jen první příjezd v každém herním roce
    const years = planned.map((day) => dateOfDayIndex(day).year);
    expect(new Set(years).size).toBe(2);
    expect(arrivals(whole)).toEqual(planned.filter((_, i) => years.indexOf(years[i]!) === i));
    // značky cest postavených v dopočtu (`road-swaths`, `planned-lining`) dává až další načtení
    const reloaded = (s: VillageState): VillageState => json2(migrateVillage(s, load));
    // hranice kousků před příjezdem vsi, v jeho den, v den kupců a po 100 dnech
    for (const cut of [AUG31 + 1, AUG31 + 2, first!, AUG31 + 100]) {
      const part = reloaded(advanceVillage(start, cut, fertileObstacles, fertile));
      const parts = advanceVillage(part, end, fertileObstacles, fertile);
      expect(reloaded(parts)).toEqual(reloaded(whole));
    }
  }, 60_000);

  // seed světa 1 (world.md – Kostra světa): stezka bez řeky – průchod, křižovatka, konec stezky
  it.each<[string, GridCell, Direction8[]]>([
    ['průchod', { x: 7, y: -1 }, ['N', 'S']],
    ['křižovatka', { x: -12, y: 6 }, ['E', 'S', 'W']],
    ['konec stezky', { x: -10, y: 26 }, ['E']],
  ])(
    'mapa se stezkou (%s; markets.md, Rozhodnutí plánu 4, bod 11): hotová stezka od založení',
    (_name, cell, directions) => {
      const { slice, landscape, obstacles } = trailMap(cell);
      expect(slice.trails.map((port) => port.side)).toEqual(directions);
      const founded = stewardArrival(travelling(), AUG31 + 2, landscape, obstacles)!;
      const trails = villageTrails(founded);
      expect(trails.map((t) => t.direction)).toEqual(directions);
      for (const trail of trails) {
        expect(trail.builtDay).toBe(AUG31 + 2);
        expect(builtTrail(founded, trail.direction)).toBe(trail);
        expect(trail.pieces.length).toBeGreaterThan(0);
        // od vsi ke kraji mapy
        expect(trail.lengthM).toBeGreaterThan(500);
      }
      expect(nonFinite(founded)).toEqual([]);
    },
    30_000,
  );

  it('mapa se stezkou: 100 dní po založení bez chyby a NaN, s kupci; vcelku = po kouscích', () => {
    const cell = { x: 7, y: -1 };
    const { landscape, obstacles } = trailMap(cell);
    const stops = trailStops(1, cell);
    const start = { ...travelling(), merchantStops: stops };
    const end = AUG31 + 102;
    const whole = advanceVillage(start, end, obstacles, landscape);
    expect([whole.foundedDay, whole.lastDay]).toEqual([AUG31 + 2, end]);
    expect(whole.people.length).toBeGreaterThanOrEqual(start.people.length);
    expect(nonFinite(whole)).toEqual([]);
    expect(villageTrails(whole).map((t) => [t.direction, t.builtDay])).toEqual([
      ['N', AUG31 + 2],
      ['S', AUG31 + 2],
    ]);
    // kupci přijeli po stezce ve dnech plánu
    const planned = merchantVisits(stops, AUG31 + 2, end).map((visit) => visit.day);
    expect(planned.length).toBeGreaterThan(0);
    const notes = (whole.market?.arrivals ?? []).filter((a) => a.merchants).map((a) => a.day);
    expect(notes).toEqual(planned);
    // hranice kousku v den příjezdu vsi
    const part = json2(advanceVillage(start, AUG31 + 2, obstacles, landscape));
    expect(json(advanceVillage(part, end, obstacles, landscape))).toBe(json(whole));
  }, 60_000);

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
