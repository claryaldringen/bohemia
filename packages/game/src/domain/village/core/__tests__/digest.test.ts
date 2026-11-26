import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { domainFoodReadyYear, villageFoodBalance } from '../../../vassalage/domain-food';
import { foundVillage } from '../actions';
import { VILLAGE_DIGEST_VERSION, isCurrentDigest, villageDigest } from '../digest';
import { joinMarket, marketDay, marketResultRef } from '../../trade/market';
import { departMarket } from '../../trade/market-trip';
import { trailExitsOf } from '../../trade/trail-exits';
import { D, homeVillage, marketVillage, report } from '../../trade/__tests__/market-fixtures';
import type { FarmSeason, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Souhrn vsi – pole jídla domény (hillfort.md – Jídlo domény; plán hradiště Ú6).

const SEP_15 = dayIndexOf({ year: 600, month: 9, day: 15 });
const AUG_1 = dayIndexOf({ year: 600, month: 8, day: 1 });

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  return s;
}

function threshingPlan(startDay: number): FarmSeason {
  return { startDay, crops: [] } as unknown as FarmSeason;
}

describe('villageDigest – jídlo domény', () => {
  it('nese verzi 4', () => {
    expect(VILLAGE_DIGEST_VERSION).toBe(4);
    expect(isCurrentDigest(villageDigest(village(SEP_15)))).toBe(true);
    expect(isCurrentDigest({ v: 3 })).toBe(false);
  });

  it('ves po výmlatu má domainReadyYear = rok', () => {
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.sheaves = { grainKg: 0, legumesKg: 0 };
    expect(villageDigest(s).domainReadyYear).toBe(600);
  });

  it('ves před žněmi nebo se snopy má domainReadyYear null', () => {
    expect(villageDigest(village(AUG_1)).domainReadyYear).toBeNull();
    const s = village(SEP_15);
    s.threshingSeason = threshingPlan(SEP_15 - 20);
    s.sheaves = { grainKg: 500, legumesKg: 0 };
    expect(villageDigest(s).domainReadyYear).toBeNull();
  });

  it('food je villageFoodBalance a domainReadyYear doména', () => {
    const s = village(SEP_15);
    const digest = villageDigest(s);
    expect(digest.food).toEqual(villageFoodBalance(s, s.lastDay));
    expect(digest.domainReadyYear).toBe(domainFoodReadyYear(s, s.lastDay));
  });

  it('ves bez lidí má food null', () => {
    const s = village(SEP_15);
    s.people = [];
    expect(villageDigest(s).food).toBeNull();
  });
});

describe('villageDigest – výstupy zemských stezek (plán 2026-11-16-dense-forest – Rozhodnutí 13)', () => {
  it('souhrn nese `trailExitsOf(stav)`; ves bez stezek []', () => {
    const plain = village(SEP_15);
    expect(villageDigest(plain).trailExits).toEqual([]);
    const s = village(SEP_15);
    s.roads = {
      nextId: 2,
      roads: [
        {
          id: 1,
          points: [
            { x: 0, z: 0 },
            { x: 940, z: 12 },
          ],
          bornDay: 0,
          grade: 'improved',
          traffic: [],
          spots: [],
        },
      ],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    };
    s.trails = [
      {
        id: 1,
        direction: 'E',
        pieces: [{ roadId: 1, grade: 'improved', manDays: 1 }],
        lengthM: 940,
        startedDay: SEP_15 - 30,
        builtDay: SEP_15 - 3,
      },
    ];
    const exits = villageDigest(s).trailExits;
    expect(exits).toHaveLength(1);
    expect(exits).toEqual(trailExitsOf(s));
  });
});

describe('villageDigest – výpravy, které ves ještě řeší (markets.md – Rozhodnutí plánu 4, bod 10)', () => {
  it('vlastní výprava od odeslání do výsledku – i s příjezdem, který v odchozí schránce jen zůstal', () => {
    const home = homeVillage();
    expect(villageDigest(home).openTrips).toEqual([]);
    const sent = departMarket(
      home,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
      {
        villageId: 'm',
        name: 'Lhota',
        cells: 1,
        firstStep: 'E',
        homeVillageId: 'h',
        homeName: 'Vlkov',
      },
    );
    if (!sent.ok) throw new Error(sent.reason);
    const { state, trip } = sent;
    expect(trip.key).toBe('market:h:1');
    // příjezd v odchozí schránce i výprava bez výsledku – jednou
    expect(villageDigest(state).openTrips).toEqual([trip.key]);
    const waiting = { ...state };
    delete waiting.outbox;
    expect(villageDigest(waiting).openTrips).toEqual([trip.key]);
    // výsledek přišel, příjezd v odchozí schránce zůstal (pád mezi zápisem a smazáním)
    const back: VillageState = { ...state, trade: { ...state.trade!, expeditions: [] } };
    expect(villageDigest(back).openTrips).toEqual([trip.key]);
    delete back.outbox;
    expect(villageDigest(back).openTrips).toEqual([]);
  });

  it('cizí výprava až s výsledkem v odchozí schránce; zprávy bez nákladu a výprava pro zboží ne', () => {
    const host = marketVillage(0);
    joinMarket(host, D, {
      key: 'market:h:7',
      fromVillageId: 'h',
      fromName: 'Vlkov',
      stayDays: 1,
      travelDays: 0,
      goods: {},
      horses: [],
      wants: {},
      report,
    });
    expect(villageDigest(host).openTrips).toEqual([]);
    marketDay(host, D);
    expect(host.outbox!.map((mail) => mail.ref)).toEqual([marketResultRef('market:h:7')]);
    expect(villageDigest(host).openTrips).toEqual(['market:h:7']);
    host.outbox = [
      {
        villageId: 'h',
        day: D + 1,
        ref: 'order:m:h:tools:1',
        body: {
          kind: 'order-ready',
          ready: { villageId: 'm', name: 'Lhota', good: 'tools', amount: 5 },
        },
      },
    ];
    expect(villageDigest(host).openTrips).toEqual([]);
  });
});
