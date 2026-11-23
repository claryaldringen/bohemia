import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import type { ChronicleEvent, MarketResult } from '../../types';
import { marketResultRef } from '../market';
import { departMarket } from '../market-trip';
import { expeditionLaborNeed } from '../trade';
import { D, asEvents, homeVillage, marketVillage, target, withoutOutbox } from './market-fixtures';

// Dvě vsi a trh mezi nimi (markets.md – Co se ověří, bod 2 bez kupců): výprava z H prodá obilí na
// trhu M a koupí krávu. Vsi mezi kroky žijí (jídlo, práce, stáda), proto se bilance počítá jen ze
// zboží výpravy a trhu, ne z celých zásob. Pošta mezi vsemi jde jako události schránky.

describe('výprava na trh mezi dvěma vsemi (markets.md – Co se ověří, bod 2)', () => {
  it('v součtu nic nevznikne ani nezmizí; cena a zpráva přijdou domů', () => {
    const h = homeVillage();
    const m = marketVillage();
    const sent = departMarket(
      h,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
    const result = (out.body as { result: MarketResult }).result;
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    // obchody hostitele
    const held = m1.chronicle.find((e): e is Held => e.kind === 'market-held')!;
    const h1 = advanceVillage(withoutOutbox(sent.state), D + 2, null, null, asEvents(m1.outbox!));
    const back = h1.chronicle.find((e) => e.kind === 'market-returned')!;
    // odešlo z H (týž den, bez simulace)
    expect(h.storesKg - sent.state.storesKg).toBeCloseTo(600, 6);
    expect(result.sold.grain! + (result.unsold.grain ?? 0)).toBeCloseTo(600, 6);
    // co výprava koupila, hostitel prodal; co výprava prodala, hostitel koupil
    expect(held).toMatchObject({ sold: result.bought });
    expect(held.bought.grain).toBeCloseTo(result.sold.grain!, 6);
    expect(back).toMatchObject({ sold: result.sold, bought: { cows: 1 }, unsold: result.unsold });
    expect(h1.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    // cena krávy zůstala na dně – nabídka převýšila poptávku, ale pod výchozí cenu nejde
    expect(m1.market!.prices.cows!).toBe(40);
    expect(h1.news![0]).toMatchObject({ villageId: 'm', prices: m1.market!.prices });
  });

  it('o mapu dál: příjezd D + 2, výsledek D + 4, lidé pryč D + 1 až D + 3', () => {
    const h = homeVillage();
    const m = marketVillage();
    const far = departMarket(
      h,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 },
      { ...target, cells: 2 },
    );
    if (!far.ok) throw new Error(far.reason);
    expect(far.state.outbox).toEqual([expect.objectContaining({ day: D + 2 })]);
    const mFar = advanceVillage(m, D + 2, null, null, asEvents(far.state.outbox!));
    expect(mFar.outbox).toEqual([
      expect.objectContaining({ day: D + 4, ref: marketResultRef(far.trip.key) }),
    ]);
    expect([D + 1, D + 3, D + 4].map((d) => expeditionLaborNeed(far.state, d))).toEqual([3, 3, 0]);
  });

  it('domovská ves po kouscích dopočtu = vcelku; vůz pryč jen ve dnech cesty a pobytu', () => {
    const h = homeVillage();
    const m = marketVillage();
    const sent = departMarket(
      h,
      D,
      { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 2 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(m, D + 2, null, null, asEvents(sent.state.outbox!));
    const events = asEvents(m1.outbox!);
    expect(events.map((e) => e.day)).toEqual([D + 3]);
    const home = withoutOutbox(sent.state);
    const whole = advanceVillage(home, D + 4, null, null, events);
    let parts = home;
    for (const day of [D + 1, D + 2, D + 3, D + 4]) {
      parts = advanceVillage(parts, day, null, null, events);
      // vůz je pryč ve dnech D + 1 a D + 2, od D + 3 doma (výsledek přijde týž den)
      expect(parts.trade!.expeditions.some((e) => (e.carts ?? []).length > 0)).toBe(day < D + 3);
    }
    expect(parts).toEqual(whole);
    expect(whole.chronicle.filter((e) => e.kind === 'market-returned')).toHaveLength(1);
  });
});
