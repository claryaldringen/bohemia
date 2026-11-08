import { describe, expect, it } from 'vitest';
import { applyInboxDay, type VillageEvent } from '../../village/inbox';
import { advanceVillage } from '../../village/simulate';
import type { Person, VillageState } from '../../village/types';
import { dispatchShipment, receiveShipment, shipmentDays } from '../shipment';
import { DAY, bundle, receiver, sender, stock } from './shipment-fixtures';

// Zásilky mezi vsemi (vassalage.md – Doprava a cílová ves): bilance zboží, příjezd, lidé s novými id.

const FULL = bundle({
  grainKg: 1_200,
  hayKg: 800,
  logs: 12,
  cattle: { cows: 3, youngOxen: 1, trainedOxen: 1 },
  horses: 2,
  people: { families: 1, men: 1, women: 1 },
});

describe('zásilka (dispatchShipment, receiveShipment)', () => {
  it('jídlo domény: dobytek se v cíli porazí do masa, stáda beze změny, domainFoodDay', () => {
    const from = sender();
    const to = receiver();
    const b = bundle({ grainKg: 500, cattle: { cows: 2, youngOxen: 0, trainedOxen: 0 } });
    const sent = dispatchShipment(from, DAY, { bundle: b, cells: 3, firstStep: 'E', domain: true });
    if (!sent.ok) throw new Error(sent.reason);
    expect(sent.body.domain).toBe(true);
    expect(stock(from).cows! - stock(sent.state).cows!).toBe(2);
    expect(from.storesKg - sent.state.storesKg).toBe(500);
    const received = structuredClone(to);
    const meatBefore = received.meatKg ?? 0;
    receiveShipment(received, DAY + 6, sent.body);
    expect(received.storesKg - to.storesKg).toBe(500);
    expect((received.meatKg ?? 0) - meatBefore).toBe(240);
    expect(stock(received).cows).toBe(stock(to).cows);
    expect(received.domainFoodDay).toBe(DAY + 6);
  });

  it('obyčejná zásilka: dobytek do stáda, domainFoodDay nevznikne, tělo bez domain', () => {
    const b = bundle({ cattle: { cows: 2, youngOxen: 0, trainedOxen: 0 } });
    const sent = dispatchShipment(sender(), DAY, { bundle: b, cells: 3, firstStep: 'E' });
    if (!sent.ok) throw new Error(sent.reason);
    expect(sent.body.domain).toBeUndefined();
    const received = structuredClone(receiver());
    const meatBefore = received.meatKg;
    receiveShipment(received, DAY + 6, sent.body);
    expect(stock(received).cows).toBe(stock(receiver()).cows! + 2);
    expect(received.domainFoodDay).toBeUndefined();
    expect(received.meatKg).toBe(meatBefore);
  });

  it('bilance: co odesílateli ubylo, to příjemci přibylo (obilí, seno, klády, dobytek, koně, lidé)', () => {
    const from = sender();
    const to = receiver();
    const before = [stock(from), stock(to)];
    const sent = dispatchShipment(from, DAY, { bundle: FULL, cells: 3, firstStep: 'E' });
    expect(sent.ok ? '' : sent.reason).toBe('');
    if (!sent.ok) return;
    const received = structuredClone(to);
    receiveShipment(received, DAY + 6, sent.body);
    const after = [stock(sent.state), stock(received)];
    for (const key of Object.keys(before[0]!)) {
      const total = before[0]![key]! + before[1]![key]!;
      expect(after[0]![key]! + after[1]![key]!, key).toBe(total);
    }
    // odesílateli ubylo přesně svazku
    expect(before[0]!.grain! - after[0]!.grain!).toBe(1_200);
    expect(before[0]!.cows! - after[0]!.cows!).toBe(3);
    expect(before[0]!.people! - after[0]!.people!).toBe(6);
    // příjemce: lidé mají nová id vsi a původ ve směru odesílatele
    const arrived = received.people.filter((p) => p.id >= 2_000);
    expect(arrived).toHaveLength(6);
    expect(arrived.every((p) => p.origin === 'W')).toBe(true);
  });

  it('lidé dorazí tytéž: pohlaví, den narození a rodinné vazby, jen s novými id', () => {
    const from = sender();
    const to = receiver();
    const sent = dispatchShipment(from, DAY, { bundle: FULL, cells: 3, firstStep: 'E' });
    if (!sent.ok) throw new Error('čekalo se odeslání');
    const left = from.people.filter((p) => !sent.state.people.some((q) => q.id === p.id));
    expect(left).toHaveLength(6);
    const received = structuredClone(to);
    receiveShipment(received, DAY + 6, sent.body);
    const arrived = received.people.filter((p) => p.id >= 2_000);
    // bilance lidí podle pohlaví a věku: co odesílateli ubylo, to příjemci přibylo
    expect(sig(arrived)).toEqual(sig(left));
    expect(sig(sent.state.people)).toEqual(sig(from.people.filter((p) => !left.includes(p))));
    // vazby uvnitř zásilky zůstaly (nová id), vazby na ty, kdo zůstali doma, se přerušily
    const oldOf = new Map(
      arrived.map((a) => [a.id, left.find((l) => l.bornDay === a.bornDay && l.sex === a.sex)!]),
    );
    const newOf = (oldId: number | undefined): number | undefined =>
      [...oldOf].find(([, o]) => o.id === oldId)?.[0];
    const stays = new Set(sent.state.people.map((p) => p.id));
    for (const a of arrived) {
      const o = oldOf.get(a.id)!;
      expect(a.spouseId).toBe(newOf(o.spouseId));
      expect(a.motherId).toBe(newOf(o.motherId));
      expect(a.fatherId).toBe(newOf(o.fatherId));
      expect(
        [a.spouseId, a.motherId, a.fatherId].some((id) => id !== undefined && stays.has(id)),
      ).toBe(false);
    }
    // rodina má manžele a děti svázané mezi sebou
    expect(arrived.filter((p) => p.spouseId !== undefined)).toHaveLength(2);
    expect(
      arrived.filter((p) => p.motherId !== undefined && p.fatherId !== undefined),
    ).toHaveLength(2);
  });

  it('zásilka nad mez dopravy se odmítne a ves zůstane', () => {
    const from = sender();
    from.commonLaborYearly = 0.5;
    const copy = structuredClone(from);
    const result = dispatchShipment(from, DAY, {
      bundle: bundle({ grainKg: 1_200 }),
      cells: 3,
      firstStep: 'E',
    });
    expect(result).toEqual({ ok: false, reason: 'Obilí je víc, než ves unese.' });
    expect(from).toEqual(copy);
  });

  it('příjezd za 2 × vzdálenost dní, nosiči se vrátí za 4 ×', () => {
    expect(shipmentDays(3)).toEqual({ arrive: 6, roundTrip: 12 });
    const sent = dispatchShipment(sender(), DAY, {
      bundle: bundle({ grainKg: 100 }),
      cells: 4,
      firstStep: 'N',
    });
    if (!sent.ok) throw new Error('čekalo se odeslání');
    expect(sent.arrivesDay).toBe(DAY + 8);
    const e = sent.state.trade!.expeditions[0]!;
    expect(e).toMatchObject({ kind: 'shipment', days: 16, direction: 'N' });
    expect(e.cost).toBe(e.porters * 16);
    expect(e.give).toEqual({ grain: 100 });
  });

  it('nedostatek vrátí důvod česky a ves nezmění', () => {
    const from = sender();
    const copy = structuredClone(from);
    const grain = dispatchShipment(from, DAY, {
      bundle: bundle({ grainKg: 9e9 }),
      cells: 1,
      firstStep: 'E',
    });
    expect(grain).toEqual({ ok: false, reason: 'Ves tolik obilí nemá.' });
    const horses = dispatchShipment(from, DAY, {
      bundle: bundle({ horses: 9 }),
      cells: 1,
      firstStep: 'E',
    });
    expect(horses.ok).toBe(false);
    const people = dispatchShipment(from, DAY, {
      bundle: bundle({ people: { families: 9, men: 0, women: 0 } }),
      cells: 1,
      firstStep: 'E',
    });
    expect(people.ok).toBe(false);
    expect(dispatchShipment(from, DAY, { bundle: bundle({}), cells: 1, firstStep: 'E' }).ok).toBe(
      false,
    );
    expect(from).toEqual(copy);
  });

  it('dopočet po kouscích: událost dne se použije stejně po 1, 3 i 10 dnech', () => {
    const sent = dispatchShipment(sender(), DAY, {
      bundle: bundle({ grainKg: 300, logs: 4, cattle: { cows: 1, youngOxen: 0, trainedOxen: 0 } }),
      cells: 1,
      firstStep: 'E',
    });
    if (!sent.ok) throw new Error('čekalo se odeslání');
    const event: VillageEvent = {
      id: 'e1',
      villageId: 'v',
      day: DAY + 3,
      seq: 1,
      body: { kind: 'shipment', shipment: sent.body },
    };
    const run = (chunks: number[]): VillageState => {
      let s = receiver();
      let day = DAY;
      for (const n of chunks) {
        s = advanceVillage(s, day + n, null, null, [event]);
        day += n;
      }
      return s;
    };
    const whole = run([10]);
    expect(run([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual(whole);
    expect(run([3, 3, 4])).toEqual(whole);
    expect(whole.chronicle.filter((e) => e.kind === 'shipment-received')).toHaveLength(1);
  });

  it('applyInboxDay použije zásilku jen v jejím dni', () => {
    const sent = dispatchShipment(sender(), DAY, {
      bundle: bundle({ grainKg: 50 }),
      cells: 1,
      firstStep: 'E',
    });
    if (!sent.ok) throw new Error('čekalo se odeslání');
    const events: VillageEvent[] = [
      {
        id: 'e',
        villageId: 'v',
        day: DAY + 2,
        seq: 1,
        body: { kind: 'shipment', shipment: sent.body },
      },
    ];
    const s = receiver();
    expect(applyInboxDay(s, DAY + 1, events)).toEqual([]);
    expect(applyInboxDay(s, DAY + 2, events)).toHaveLength(1);
    expect(s.storesKg).toBe(1_050);
  });
});

/** Pohlaví a den narození, seřazené (porovnání lidí bez ohledu na id). */
function sig(people: readonly Person[]): string[] {
  return people.map((p) => `${p.sex}:${p.bornDay}`).sort();
}
