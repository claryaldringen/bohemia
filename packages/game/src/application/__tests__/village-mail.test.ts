import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import { villageHorses, type ChronicleEvent, type MarketOrder } from '../../domain/village';
import { D } from '../../domain/village/trade/__tests__/market-fixtures';
import { advanceDynasty } from '../advance-dynasty';
import { dynastyForVillage } from '../dynasty-for-village';
import { deliverVillageMail, deliverVillageMailSafely, hasVillageMail } from '../village-mail';
import {
  FOAL_ID,
  H_PLAYER,
  cowsOf,
  marketWorld,
  returnedOf,
  type MarketWorld,
} from './market-world';

// Pošta mezi vsemi (markets.md – Rozhodnutí plánu 2, bod 6): odchozí schránka vsi se doručí do
// schránek cílových vsí právě jednou a výprava po termínu se podívá na hostitele – výsledek
// z jeho odchozí schránky doručí sama, zaniklý hostitel výpravu vrátí.

/** Obilí za krávu, den na trhu (ves na sousední mapě – ráno tam, večer zpět). */
const ORDER: MarketOrder = { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 };

/** Události `market-result` ve schránce vsi (všechny dny). */
async function resultsOf(w: MarketWorld, villageId: string): Promise<{ day: number }[]> {
  const events = await w.villages.inbox.pending(villageId, -1, TOTAL_GAME_DAYS);
  return events.filter((e) => e.body.kind === 'market-result');
}

describe('deliverVillageMail – pošta mezi vsemi', () => {
  it('kolo tam a zpět: H má krávu a M obilí, odchozí schránky jsou pryč, podruhé nic', async () => {
    const w = await marketWorld();
    const cows = cowsOf(w.state(w.h));
    await w.depart(ORDER);
    expect(hasVillageMail(w.state(w.h))).toBe(true);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    await w.load(w.m, D + 1);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    await w.load(w.h, D + 2);

    const [back] = returnedOf(w.state(w.h));
    expect(back).toMatchObject({ day: D + 2, villageName: 'Lhota', bought: { cows: 1 } });
    // krávy ubývají po zlomcích (úmrtnost po dnech) – přibyla celá kráva
    expect(cowsOf(w.state(w.h))).toBeCloseTo(cows + 1, 2);
    // co výprava prodala, hostitel koupil – M má obilí
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    const held = w.state(w.m).chronicle.find((e): e is Held => e.kind === 'market-held');
    expect(held?.bought.grain).toBeCloseTo(back!.sold.grain!, 6);
    expect(w.state(w.h).outbox).toBeUndefined();
    expect(w.state(w.m).outbox).toBeUndefined();
    expect(w.state(w.h).trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    expect([hasVillageMail(w.state(w.h)), hasVillageMail(w.state(w.m))]).toEqual([false, false]);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
  });

  it('hostitel pozadu: výprava čeká, výsledek přijde v nejbližší nespočtený den jednou', async () => {
    const w = await marketWorld();
    await w.depart(ORDER);
    await deliverVillageMail(w.deps, w.h);
    await w.load(w.h, D + 6);
    // po termínu (returnDay D + 2) bez výsledku – živý hostitel pozadu znamená čekat
    expect(hasVillageMail(w.state(w.h))).toBe(true);
    const version = w.version(w.h);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(w.version(w.h)).toBe(version);
    await w.load(w.m, D + 6);
    // výsledek leží v odchozí schránce M – H ho doručí sama, M pak už nic nezapíše
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(w.state(w.m).outbox).toBeUndefined();
    expect((await resultsOf(w, w.h)).map((e) => e.day)).toEqual([D + 7]);
    const cows = cowsOf(w.state(w.h));
    await w.load(w.h, D + 7);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({ day: D + 7, bought: { cows: 1 } }),
    ]);
    expect(cowsOf(w.state(w.h))).toBeCloseTo(cows + 1, 2);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
  });

  it('M vymře před příjezdem: po termínu se výprava vrátí se vším (obilí i hříbě)', async () => {
    const w = await marketWorld({ horses: true });
    // vrácení koně dostanou nová id (`addHorses`) – hříbě se pozná podle dne narození
    const foal = villageHorses(w.state(w.h)).find((h) => h.id === FOAL_ID)!;
    const isFoal = (h: { bornDay: number; sex: string }): boolean =>
      h.bornDay === foal.bornDay && h.sex === foal.sex;
    const horses = villageHorses(w.state(w.h)).length;
    await w.depart({ ...ORDER, give: { grain: 600, foals: 1 } });
    await deliverVillageMail(w.deps, w.h);
    w.villages.edit(w.m, (s) => {
      s.extinctDay = s.lastDay;
    });
    // před termínem (returnDay D + 2) se nic neděje
    await w.load(w.h, D + 1);
    expect(hasVillageMail(w.state(w.h))).toBe(false);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    await w.load(w.h, D + 2);
    expect(villageHorses(w.state(w.h)).some(isFoal)).toBe(false);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect((await resultsOf(w, w.h)).map((e) => e.day)).toEqual([D + 3]);
    await w.load(w.h, D + 3);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({
        day: D + 3,
        returned: true,
        sold: {},
        bought: {},
        unsold: { grain: 600, foals: 1 },
      }),
    ]);
    expect(villageHorses(w.state(w.h)).some(isFoal)).toBe(true);
    expect(villageHorses(w.state(w.h))).toHaveLength(horses);
    expect(w.state(w.h).trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
  });

  it('sídlo M archivované během pobytu: výprava se vrátí s tím, co drží; M nic dalšího nezapíše', async () => {
    const w = await marketWorld();
    await w.depart({ ...ORDER, stayDays: 2 });
    await deliverVillageMail(w.deps, w.h);
    await w.load(w.m, D + 1);
    // první tržní den – návštěvník už koupil krávu, zbytek obilí drží
    const visitor = w.state(w.m).market!.visitors[0]!;
    expect(visitor.bought).toEqual({ cows: 1 });
    await w.settlements.archive(w.villages.records.get(w.m)!.settlementId);
    await w.load(w.h, D + 3);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    await w.load(w.h, D + 4);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({
        returned: true,
        sold: visitor.sold,
        bought: { cows: 1 },
        unsold: visitor.goods,
      }),
    ]);
    // druhý výsledek má týž `ref` a zahodí se; že se zboží nerozejde, platí jen proto, že archivované
    // vsi nikdo nedopočítává (snímek, ze kterého H výsledek vzala, je konečný)
    await w.load(w.m, D + 3);
    expect(w.state(w.m).outbox).toHaveLength(1);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(await resultsOf(w, w.h)).toHaveLength(1);
  });

  it('příjezd, který minule nešlo smazat z odchozí schránky, se po zániku hostitele nevrátí celý', async () => {
    const w = await marketWorld();
    await w.depart({ ...ORDER, stayDays: 2 });
    // příjezd se zapsal, ale smazání z odchozí schránky selhalo
    w.villages.beforeSave = (): void => {
      throw new Error('výpadek databáze');
    };
    expect(await deliverVillageMailSafely(w.deps, w.h, () => {})).toBe(0);
    w.villages.beforeSave = null;
    await w.load(w.m, D + 1);
    expect(w.state(w.m).market!.visitors[0]!.bought).toEqual({ cows: 1 });
    w.villages.edit(w.m, (s) => {
      s.extinctDay = s.lastDay;
    });
    await w.load(w.h, D + 3);
    expect(w.state(w.h).outbox).toHaveLength(1);
    // příjezd už hostitel použil – výprava se vrátí s tím, co drží, ne se vším
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    await w.load(w.h, D + 4);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({ returned: true, bought: { cows: 1 } }),
    ]);
    expect(returnedOf(w.state(w.h))[0]!.sold.grain).toBeGreaterThan(0);
  });

  it('cílová ves zmizela: příjezd se vrátí domů v den návratu, výsledek pro zmizelou ves se zahodí', async () => {
    const w = await marketWorld();
    const trip = await w.depart(ORDER);
    // M zmizela i se záznamem (`villages.find` → null), v její odchozí schránce výsledek pro H
    w.villages.records.delete(w.m);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(w.state(w.h).outbox).toBeUndefined();
    expect((await resultsOf(w, w.h)).map((e) => e.day)).toEqual([trip.returnDay]);
    await w.load(w.h, trip.returnDay);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({ returned: true, unsold: { grain: 600 } }),
    ]);
    // výsledek pro zmizelou domovskou ves – zahodí se
    w.villages.edit(w.h, (s) => {
      s.outbox = [
        {
          villageId: 'zmizela',
          day: D + 3,
          ref: 'market:zmizela:1:out',
          body: {
            kind: 'market-result',
            result: { key: 'market:zmizela:1', sold: {}, bought: {}, unsold: {}, horses: [] },
          },
        },
      ];
    });
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(w.state(w.h).outbox).toBeUndefined();
  });

  it('výsledek s lidmi pro zmizelou domovskou ves se nezahodí – lidé nezmizí', async () => {
    const w = await marketWorld();
    // rodina, kterou výprava zmizelé vsi neprodala (markets.md – Rozhodnutí plánu 3, bod 10)
    const family = {
      good: 'families' as const,
      people: [{ id: 5, bornDay: D - 10_000, dwellingId: 1, sex: 'male' as const }],
    };
    const mail = {
      villageId: 'zmizela',
      day: D + 3,
      ref: 'market:zmizela:2:out',
      body: {
        kind: 'market-result' as const,
        result: {
          key: 'market:zmizela:2',
          sold: {},
          bought: {},
          unsold: { families: 1 },
          horses: [],
          people: [family],
        },
      },
    };
    w.villages.edit(w.h, (s) => {
      s.outbox = [mail];
    });
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(w.state(w.h).outbox).toEqual([mail]);
  });

  it('chyba doručení dopočet nezastaví – Safely ji zapíše a vrátí 0', async () => {
    const w = await marketWorld();
    await w.depart(ORDER);
    const failure = new Error('výpadek databáze');
    w.villages.beforeSave = (): void => {
      throw failure;
    };
    const logged: unknown[] = [];
    const log = (_message: string, error: unknown): void => void logged.push(error);
    expect(await deliverVillageMailSafely(w.deps, w.h, log)).toBe(0);
    expect(logged).toEqual([failure]);
    // příjezd se zapsal, odchozí schránka zůstala – příští doručení ji smaže a nic nezdvojí
    w.villages.beforeSave = null;
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(w.state(w.h).outbox).toBeUndefined();
    expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toHaveLength(1);
  });

  it('souběh: zápis do vsi mezi načtením a uložením – smaže jen doručené, zbytek zůstane', async () => {
    const w = await marketWorld();
    await w.depart(ORDER);
    let raced = false;
    w.villages.beforeSave = (id): void => {
      if (raced || id !== w.h) return;
      raced = true;
      // jiný požadavek mezitím přidal zprávu (zvedne verzi – uložení selže a zkusí se znovu)
      w.villages.edit(w.h, (s) => {
        s.outbox!.push({ ...s.outbox![0]!, ref: 'jiny:in' });
      });
    };
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(w.state(w.h).outbox!.map((m) => m.ref)).toEqual(['jiny:in']);
  });
});

describe('web po dopočtu doručí odchozí schránky vsí hráče', () => {
  it('dynastyForVillage – příjezd výpravy jde do schránky M', async () => {
    const w = await marketWorld();
    const trip = await w.depart(ORDER);
    await dynastyForVillage(w.deps, { playerId: H_PLAYER, villageId: w.h, today: D });
    expect(w.state(w.h).outbox).toBeUndefined();
    const events = await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS);
    expect(events).toEqual([
      expect.objectContaining({
        day: D + 1,
        body: expect.objectContaining({ kind: 'market-arrive' }),
      }),
    ]);
    expect(events[0]!.body).toMatchObject({ arrival: { key: trip.key } });
  });

  it('advanceDynasty – příjezd výpravy jde do schránky M', async () => {
    const w = await marketWorld();
    await w.depart(ORDER);
    await advanceDynasty(w.deps, { playerId: H_PLAYER, today: D + 1 });
    expect(w.state(w.h).outbox).toBeUndefined();
    expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toHaveLength(1);
  });
});

describe('hostitel vymře v dopočtu přes den příjezdu', () => {
  it('příjezd přeskočený spící vsí se vrátí se vším, jednou', async () => {
    const w = await marketWorld();
    await w.depart(ORDER);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    w.villages.edit(w.m, (s) => {
      s.people = [];
    });
    await w.load(w.m, D + 3);
    expect(w.state(w.m).extinctDay).toBe(D);
    expect(w.state(w.m).lastDay).toBe(D + 3);
    await w.load(w.h, D + 2);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    await w.load(w.h, D + 3);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({ returned: true, unsold: { grain: 600 } }),
    ]);
    expect(hasVillageMail(w.state(w.h))).toBe(false);
  });
});
