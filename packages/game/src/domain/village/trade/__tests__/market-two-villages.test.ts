import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import { toolEquipmentKg, toolNeedKg } from '../../crafts/iron';
import { CRAFT_NEEDS } from '../../rules';
import type { ChronicleEvent, MarketResult } from '../../types';
import { marketResultRef } from '../market';
import { marketStance } from '../market-stance';
import { departMarket } from '../market-trip';
import { expeditionLaborNeed } from '../trade';
import {
  D,
  asEvents,
  homeVillage,
  marketVillage,
  target,
  withWorkshop,
  withoutOutbox,
} from './market-fixtures';

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
    // kronika hostitele: nejdřív příjezd výpravy, pak obchod (morning.push – ranní zápisy po ranách)
    const kinds = m1.chronicle.map((e) => e.kind);
    expect(kinds.indexOf('market-arrived')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('market-arrived')).toBeLessThan(kinds.indexOf('market-held'));
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

  // Výrobky dílen (markets.md – Rozhodnutí plánu 3, body 4 a 5): ves bez kováře koupí nástroje
  // u kováře souseda za obilí. Bilance proti téže vsi bez trhu (vsi mezi kroky žijí).
  it('nástroje za obilí: H bez kováře koupí 10 kg od M s kovářem, 4 mince za kg proti 1 ÷ 15', () => {
    const h = homeVillage();
    h.toolEquipmentKg = toolNeedKg(h, D) - 10;
    const m = marketVillage();
    withWorkshop(m, 'smith', 700, { oreKg: 500 });
    m.crafts = { charcoalKg: 5_000, potteryKg: 0 };
    m.toolEquipmentKg = toolNeedKg(m, D) + 30;
    // M nabízí vybavení nad potřebu a shání obilí; H shání přesně 10 kg
    expect(marketStance(m, D).offer.tools).toBe(30);
    expect(marketStance(m, D).wants.grain).toBeGreaterThan(600);
    expect(marketStance(h, D).wants.tools).toBe(10);
    const sent = departMarket(
      h,
      D,
      { give: { grain: 900 }, wants: { tools: 10 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    const m1 = advanceVillage(m, D + 1, null, null, asEvents(sent.state.outbox!));
    const mAlone = advanceVillage(m, D + 1, null, null);
    const out = m1.outbox!.find((x) => x.ref === marketResultRef(sent.trip.key))!;
    const result = (out.body as { result: MarketResult }).result;
    // 10 kg × 4 mince = 40 mincí = 600 kg obilí × 1 ÷ 15; zbylých 300 kg se vrátí
    expect(result.bought).toEqual({ tools: 10 });
    expect(result.sold.grain).toBeCloseTo(600, 6);
    expect(result.unsold.grain).toBeCloseTo(300, 6);
    expect(m1.market!.prices.tools).toBe(4);
    // M prodal nástroje a koupil přesně obilí, které H prodala
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    const held = m1.chronicle.find((e): e is Held => e.kind === 'market-held')!;
    expect(held.sold).toEqual({ tools: 10 });
    expect(held.bought.grain).toBeCloseTo(result.sold.grain!, 6);
    // M: o 10 kg vybavení méně (nad potřebou se opotřebí stejně); zásoby obilí o prodané víc, bez
    // ztrát skladováním zbytku dne (0,17 kg z 600)
    expect(toolEquipmentKg(mAlone) - toolEquipmentKg(m1)).toBeCloseTo(10, 9);
    expect(m1.storesKg - mAlone.storesKg).toBeCloseTo(600, 0);
    expect(m1.storesKg - mAlone.storesKg).toBeLessThan(600);
    // H: výsledek ráno D + 2 přidá 10 kg do vybavení; ten den se v užívání opotřebí jako ostatní
    // (CRAFT_NEEDS.toolWearPerYear ÷ 365 – wearCraftStocks)
    const home = withoutOutbox(sent.state);
    const h1 = advanceVillage(home, D + 2, null, null, asEvents(m1.outbox!));
    const hAlone = advanceVillage(home, D + 2, null, null);
    expect(h1.chronicle.find((e) => e.kind === 'market-returned')).toMatchObject({
      bought: { tools: 10 },
    });
    expect(toolEquipmentKg(h1) - toolEquipmentKg(hAlone)).toBeCloseTo(
      10 * (1 - CRAFT_NEEDS.toolWearPerYear / 365),
      9,
    );
  });
});
