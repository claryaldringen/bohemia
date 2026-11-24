import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import {
  marketResultRef,
  villageHorses,
  type ChronicleEvent,
  type MarketOrder,
  type MarketResult,
  type Person,
  type VillageMail,
} from '../../domain/village';
import { DAY } from '../../domain/village/__tests__/kin-fixtures';
import { DAUGHTER } from '../../domain/village/people/__tests__/kin-match-fixtures';
import { takePeople } from '../../domain/village/trade/market-people';
import {
  D,
  FAMILY_IDS,
  familyHome,
  report,
} from '../../domain/village/trade/__tests__/market-fixtures';
import { advanceDynasty } from '../advance-dynasty';
import { dynastyForVillage } from '../dynasty-for-village';
import { deliverVillageMail, deliverVillageMailSafely, hasVillageMail } from '../village-mail';
import {
  FOAL_ID,
  H_PLAYER,
  askBride,
  cowsOf,
  kinWorld,
  marketWorld,
  returnedOf,
  type MarketWorld,
} from './market-world';

// Pošta mezi vsemi (markets.md – Rozhodnutí plánu 2, bod 6): odchozí schránka vsi se doručí do
// schránek cílových vsí právě jednou a výprava po termínu se podívá na hostitele – výsledek
// z jeho odchozí schránky doručí sama, zaniklý hostitel výpravu vrátí.

/** Obilí za krávu, den na trhu (ves na sousední mapě – ráno tam, večer zpět). */
const ORDER: MarketOrder = { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 };

/** Id lidí vzestupně. */
const ids = (people: readonly Person[]): number[] => people.map((p) => p.id).sort((a, b) => a - b);

/** Lidé rodiny na prodej (`familyHome`) ve vsi. */
const family = (people: readonly Person[]): Person[] =>
  people.filter((p) => FAMILY_IDS.includes(p.id));

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

  it('výsledek s lidmi pro zmizelou domovskou ves se nezahodí – lidé jdou zpět k hostiteli', async () => {
    const w = await marketWorld();
    // rodina, kterou výprava zmizelé vsi neprodala (markets.md – Rozhodnutí plánu 3, bod 10) –
    // výsledek z doby před `origin`: usadí se bez směru a kroniky
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
    const nextId = w.state(w.h).nextId;
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(w.state(w.h).outbox).toBeUndefined();
    const back = await w.villages.inbox.pending(w.h, -1, TOTAL_GAME_DAYS);
    expect(back).toEqual([
      expect.objectContaining({
        day: D + 3,
        body: { kind: 'people-back', key: 'market:zmizela:2', people: [family] },
      }),
    ]);
    await w.load(w.h, D + 3);
    // usazený s novým id (ves mezitím mohla `nextId` posunout), bez směru
    const settled = w.state(w.h).people.filter((p) => p.bornDay === D - 10_000);
    expect(settled).toHaveLength(1);
    expect(settled[0]!.id).toBeGreaterThanOrEqual(nextId);
    expect(settled[0]!.origin).toBeUndefined();
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

describe('pošta plánu 3 – zaniklé vsi (markets.md – Rozhodnutí plánu 3, bod 13)', () => {
  /** Zpráva bez nákladu z H do M druhu `kind` (dotaz na partnera, na kováře, hotová zakázka). */
  function query(w: MarketWorld, kind: 'kin-ask' | 'smith-ask' | 'order-ready'): VillageMail {
    const from = { fromVillageId: w.h, fromName: 'Vlkov', cells: 1, firstStep: 'E' as const };
    const body: VillageMail['body'] =
      kind === 'kin-ask'
        ? {
            kind,
            ask: {
              key: `kin:${w.h}:${D}:20`,
              ...from,
              seeker: { personId: 20, sex: 'male', bornDay: D - 9_500, widowed: false },
              report,
            },
          }
        : kind === 'smith-ask'
          ? { kind, ask: { key: `smith:${w.h}:${D}`, ...from, horses: 2, report } }
          : { kind, ready: { villageId: w.h, name: 'Vlkov', good: 'tools', amount: 10 } };
    return { villageId: w.m, day: D + 1, ref: `${kind}:${w.h}:${D}`, body };
  }

  it.each([
    ['kin-ask', 'spí'],
    ['smith-ask', 'chybí'],
    ['order-ready', 'sídlo v archivu'],
  ] as const)('%s do vsi, která %s, se nezapíše a zmizí z outbox', async (kind, how) => {
    const w = await marketWorld();
    const mail = query(w, kind);
    w.villages.edit(w.h, (s) => {
      s.outbox = [mail];
    });
    if (how === 'spí') {
      w.villages.edit(w.m, (s) => {
        s.extinctDay = s.lastDay;
      });
    } else if (how === 'chybí') {
      w.villages.records.delete(w.m);
    } else {
      await w.settlements.archive(w.villages.records.get(w.m)!.settlementId);
    }
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(w.state(w.h).outbox).toBeUndefined();
    if (how !== 'chybí')
      expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toEqual([]);
    // živá ves dotaz dostane
    const live = await marketWorld();
    live.villages.edit(live.h, (s) => {
      s.outbox = [query(live, kind)];
    });
    expect(await deliverVillageMail(live.deps, live.h)).toBe(1);
  });

  it('H prodá rodinu M, M vymře před dnem příjezdu: po termínu je rodina zpět v H s původními id', async () => {
    const w = await marketWorld({ home: familyHome() });
    const trip = await w.depart({ give: { families: 1 }, wants: { grain: 720 }, stayDays: 1 });
    expect(family(w.state(w.h).people)).toEqual([]);
    // příjezd je už ve schránce M
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    w.villages.edit(w.m, (s) => {
      s.extinctDay = s.lastDay;
    });
    await w.load(w.h, trip.returnDay);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    await w.load(w.h, trip.returnDay + 1);
    const h = w.state(w.h);
    expect(ids(family(h.people))).toEqual(FAMILY_IDS);
    expect((h.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id))).toEqual([]);
    expect(returnedOf(h)).toEqual([
      expect.objectContaining({ returned: true, unsold: { families: 1 } }),
    ]);
  });

  it.each(['spí', 'chybí'] as const)(
    'H koupí rodinu od M a %s před návratem výsledku: M zapíše people-back, rodina zpět v M',
    async (how) => {
      const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
      const key = `market:${w.h}:1`;
      const nextId = w.state(w.m).nextId;
      const total = w.state(w.m).people.length;
      // M prodala rodinu výpravě H (odjezd výpravy – výsledek s koupenými lidmi a `origin`)
      w.villages.edit(w.m, (s) => {
        const newcomers = takePeople(s, D - 1, 'families', 1, 'W');
        const result: MarketResult = {
          key,
          sold: { grain: 720 },
          bought: { families: 1 },
          unsold: {},
          horses: [],
          newcomers,
          origin: { villageId: w.h, villageName: 'Vlkov', direction: 'W' },
        };
        s.outbox = [
          {
            villageId: w.h,
            day: D + 1,
            ref: marketResultRef(key),
            body: { kind: 'market-result', result },
          },
        ];
      });
      expect(family(w.state(w.m).people)).toEqual([]);
      if (how === 'spí') {
        w.villages.edit(w.h, (s) => {
          s.extinctDay = s.lastDay;
        });
      } else {
        w.villages.records.delete(w.h);
      }
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      expect(w.state(w.m).outbox).toBeUndefined();
      const back = await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS);
      expect(back).toEqual([
        expect.objectContaining({
          day: D + 1,
          body: expect.objectContaining({ kind: 'people-back', key }),
        }),
      ]);
      if (how === 'spí') expect(await resultsOf(w, w.h)).toEqual([]);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
      await w.load(w.m, D + 1);
      const m = w.state(w.m);
      expect(ids(family(m.people))).toEqual(FAMILY_IDS);
      expect(m.people.find((p) => p.id === 64)).toMatchObject({ motherId: 63, fatherId: 62 });
      expect((m.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id))).toEqual([]);
      // nikdo nevznikl ani nezmizel: nová id jen narození, lidí jako před prodejem
      const born = m.chronicle.filter((e) => e.day >= D && e.kind === 'birth').length;
      const died = m.chronicle.filter((e) => e.day >= D && e.kind === 'death').length;
      expect(m.people.filter((p) => p.id >= nextId)).toHaveLength(born);
      expect(m.people.length - born + died).toBe(total);
      expect(m.chronicle.filter((e) => e.kind === 'newcomer')).toEqual([]);
    },
  );

  it('spí-li i hostitel, výsledek s lidmi se zahodí – obě vsi jsou pryč', async () => {
    const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
    const key = `market:${w.h}:1`;
    w.villages.edit(w.m, (s) => {
      const newcomers = takePeople(s, D - 1, 'families', 1, 'W');
      s.outbox = [
        {
          villageId: w.h,
          day: D + 1,
          ref: marketResultRef(key),
          body: {
            kind: 'market-result',
            result: { key, sold: {}, bought: { families: 1 }, unsold: {}, horses: [], newcomers },
          },
        },
      ];
      s.extinctDay = s.lastDay;
    });
    w.villages.records.delete(w.h);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(w.state(w.m).outbox).toBeUndefined();
    expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toEqual([]);
  });

  it('nevěsta z M na cestě do H, H smazaná (Začít znovu archivuje sídlo): nevěsta zpět v M', async () => {
    const w = await kinWorld();
    await askBride(w, DAY + 1);
    await w.load(w.m, DAY + 1);
    expect(w.state(w.m).people.map((p) => p.id)).not.toContain(DAUGHTER);
    const trip = w.state(w.m).trade!.expeditions.find((e) => e.by === 'kin')!.market!;
    // příjezd nevěsty je ve schránce H
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    await w.settlements.archive(w.villages.records.get(w.h)!.settlementId);
    await w.load(w.m, trip.returnDay);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    await w.load(w.m, trip.returnDay + 1);
    const m = w.state(w.m);
    expect(m.people.find((p) => p.id === DAUGHTER)).toMatchObject({ sex: 'female' });
    expect((m.emigrants ?? []).map((e) => e.id)).not.toContain(DAUGHTER);
    expect(returnedOf(m)).toEqual([expect.objectContaining({ returned: true })]);
    expect(m.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
  });
});
