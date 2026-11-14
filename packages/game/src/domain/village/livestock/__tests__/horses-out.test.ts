import { describe, expect, it } from 'vitest';
import { horseBirths, retireHorses } from '../horse-breeding';
import { applyJourneyHorse, horsesOut } from '../horses-out';
import { villageHorses } from '../horses';
import { applyInboxDay, type VillageEventBody } from '../../core/inbox';
import { at, horse, horseVillage, SON_ID } from '../../__tests__/horse-fixtures';
import type { VillageState } from '../../types';

// Koně venku s výpravou (expeditions.md – Kůň): jezdec s `away.horseId` vede koně z ohrady, chov
// 1. 5. a porážka 1. 11. koně venku přeskočí.

const DAY = at(601, 10, 20);

/** Doručí událost schránky vsi v den `day` (stejná cesta jako ve hře). */
const applyEvent = (s: VillageState, day: number, b: VillageEventBody): void => {
  applyInboxDay(s, day, [{ id: 'e', villageId: 'v', day, seq: 0, body: b }]);
};

/** Ves, ve které jezdec (syn 12) jede s výpravou `j1` na koni 5 (`riderId` v ohradě). */
function village(horses = [horse(5, 8, 'male', 0, DAY)], day = DAY): VillageState {
  const s = horseVillage(horses, 3);
  const h = villageHorses(s).find((x) => x.id === 5);
  if (h) h.riderId = SON_ID;
  const rider = s.people.find((p) => p.id === SON_ID)!;
  rider.away = { kind: 'journey', refId: 'j1' };
  s.lastDay = day;
  return s;
}

const body = (horseId: number | null, journeyId = 'j1') => ({
  kind: 'journey-horse' as const,
  journeyId,
  personId: SON_ID,
  horseId,
});

describe('journey-horse (expeditions.md – Kůň)', () => {
  it('nastaví away.horseId, smaže ho null a cizí výprava nic nezmění', () => {
    const s = village();
    expect(horsesOut(s, DAY).size).toBe(0);
    applyEvent(s, DAY, body(5));
    expect(s.people.find((p) => p.id === SON_ID)!.away?.horseId).toBe(5);
    expect([...horsesOut(s, DAY)]).toEqual([5]);
    applyEvent(s, DAY, body(null, 'jiná'));
    expect([...horsesOut(s, DAY)]).toEqual([5]);
    applyEvent(s, DAY, body(null));
    expect(horsesOut(s, DAY).size).toBe(0);
  });

  it('kůň jiného jezdce nebo cizí kůň se nenastaví; událost je idempotentní', () => {
    const s = village();
    expect(applyJourneyHorse(s, DAY, { journeyId: 'j1', personId: SON_ID, horseId: 99 })).toEqual(
      [],
    );
    expect(horsesOut(s, DAY).size).toBe(0);
    villageHorses(s)[0]!.riderId = 12345;
    applyJourneyHorse(s, DAY, { journeyId: 'j1', personId: SON_ID, horseId: 5 });
    expect(horsesOut(s, DAY).size).toBe(0);
    villageHorses(s)[0]!.riderId = SON_ID;
    applyJourneyHorse(s, DAY, { journeyId: 'j1', personId: SON_ID, horseId: 5 });
    applyJourneyHorse(s, DAY, { journeyId: 'j1', personId: SON_ID, horseId: 5 });
    expect([...horsesOut(s, DAY)]).toEqual([5]);
  });

  it('po návratu jezdce (away.untilDay) kůň není venku', () => {
    const s = village();
    applyEvent(s, DAY, body(5));
    s.people.find((p) => p.id === SON_ID)!.away!.untilDay = DAY + 3;
    expect(horsesOut(s, DAY + 2).size).toBe(1);
    expect(horsesOut(s, DAY + 3).size).toBe(0);
  });

  it('1. 11.: kůň 25 let venku nejde na maso, v ohradě ano', () => {
    const NOV = at(601, 11, 1);
    const old = horse(5, 25, 'male', 0, NOV);
    const home = village([old, horse(6, 6, 'male', 0, NOV)], NOV);
    expect(retireHorses(home, NOV).length).toBeGreaterThan(0);
    expect(villageHorses(home).map((h) => h.id)).not.toContain(5);

    const out = village([{ ...old }, horse(6, 6, 'male', 0, NOV)], NOV);
    applyEvent(out, NOV, body(5));
    expect(horsesOut(out, NOV).has(5)).toBe(true);
    retireHorses(out, NOV);
    expect(villageHorses(out).map((h) => h.id)).toContain(5);
  });

  it('1. 5.: jediný hřebec venku – žádné hříbě, v ohradě – hříbě', () => {
    const MAY = at(602, 5, 1);
    const mk = (): VillageState => {
      const s = village([horse(5, 8, 'male', 0, MAY), horse(2, 6, 'female', 0, MAY)], MAY);
      return s;
    };
    const home = mk();
    delete home.people.find((p) => p.id === SON_ID)!.away;
    const born = horseBirths(home, MAY).reduce(
      (n, e) => n + (e.kind === 'foal-born' ? e.foals : 0),
      0,
    );
    expect(born).toBeGreaterThan(0);

    const out = mk();
    applyEvent(out, MAY, body(5));
    expect(horseBirths(out, MAY)).toEqual([]);
  });

  it('jezdec padl (journey-casualty smrt): koně není venku, v ohradě dál', () => {
    const s = village();
    applyEvent(s, DAY, body(5));
    applyEvent(s, DAY, {
      kind: 'journey-casualty',
      journeyId: 'j1',
      personId: SON_ID,
      outcome: 'dead',
      by: 'wolves',
    });
    expect(horsesOut(s, DAY).size).toBe(0);
    expect(villageHorses(s).map((h) => h.id)).toContain(5);
  });
});
