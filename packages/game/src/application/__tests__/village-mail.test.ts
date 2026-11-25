import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import {
  marketArrivalRef,
  marketResultRef,
  villageHorses,
  type ChronicleEvent,
  type MarketArrival,
  type MarketOrder,
  type MarketResult,
  type Person,
  type VillageMail,
} from '../../domain/village';
import { DAY } from '../../domain/village/__tests__/kin-fixtures';
import { endVillage } from '../../domain/village/core/extinction';
import { DAUGHTER } from '../../domain/village/people/__tests__/kin-match-fixtures';
import { takePeople } from '../../domain/village/trade/market-people';
import {
  D,
  FAMILY_IDS,
  familyHome,
  homeVillage,
  marketVillage,
  report,
} from '../../domain/village/trade/__tests__/market-fixtures';
import { advanceDynasty } from '../advance-dynasty';
import { advancePlayer } from '../advance-world';
import { dynastyForVillage } from '../dynasty-for-village';
import { runWorldTasks } from '../succession-credits';
import {
  MAIL_KEEP_DAYS,
  MAIL_PRUNE_ROWS,
  deliverVillageMail,
  deliverVillageMailSafely,
  hasVillageMail,
  pruneSettledMail,
  returnStrandedPeople,
} from '../village-mail';
import {
  FOAL_ID,
  H_PLAYER,
  M_PLAYER,
  askBride,
  coinsOfWorld,
  cowsOf,
  kinWorld,
  marketWorld,
  returnedOf,
  thirdVillage,
  type MarketWorld,
} from './market-world';
import { InMemoryActivity } from './in-memory-activity';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryInvites } from './in-memory-invites';
import { InMemoryNotices } from './in-memory-notices';

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
        body: { kind: 'stranded-people', key: 'market:zmizela:2', people: [family] },
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

  /**
   * H jede pro rodinu do M (výprava v `trade.expeditions` H) a M ji výpravě prodala: výsledek
   * s rodinou M (`fromHost` – prodala ji sama M) v odchozí schránce M, den návratu D + 1.
   */
  async function familyBought(w: MarketWorld): Promise<string> {
    const trip = await w.depart({ give: { grain: 600 }, wants: { families: 1 }, stayDays: 1 });
    w.villages.edit(w.h, (s) => {
      delete s.outbox;
    });
    w.villages.edit(w.m, (s) => {
      const newcomers = takePeople(s, D - 1, 'families', 1, 'W').map((g) => ({
        ...g,
        fromHost: true as const,
      }));
      const result: MarketResult = {
        key: trip.key,
        sold: { grain: 600 },
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
          ref: marketResultRef(trip.key),
          body: { kind: 'market-result', result },
        },
      ];
    });
    return trip.key;
  }

  /** Rodina je zpět v M s původními id a vazbami, nikdo nevznikl ani nezmizel (nová id jen narození). */
  function familyHomeAgain(w: MarketWorld, nextId: number, total: number): void {
    const m = w.state(w.m);
    expect(ids(family(m.people))).toEqual(FAMILY_IDS);
    expect(m.people.find((p) => p.id === 64)).toMatchObject({ motherId: 63, fatherId: 62 });
    expect((m.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id))).toEqual([]);
    const born = m.chronicle.filter((e) => e.day >= D && e.kind === 'birth').length;
    const died = m.chronicle.filter((e) => e.day >= D && e.kind === 'death').length;
    expect(m.people.filter((p) => p.id >= nextId)).toHaveLength(born);
    expect(m.people.length - born + died).toBe(total);
    expect(new Set(m.people.map((p) => p.id)).size).toBe(m.people.length);
    // vrácená rodina má zápis v kronice (`returned`), nováček není nikdo
    expect(m.chronicle.filter((e) => e.kind === 'newcomer')).toEqual([
      expect.objectContaining({ group: 'family', people: 4, returned: true, villageName: 'Vlkov' }),
    ]);
  }

  it.each(['spí', 'chybí'] as const)(
    'H koupí rodinu od M a %s před návratem výsledku: M zapíše stranded-people, rodina zpět v M',
    async (how) => {
      const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
      const nextId = w.state(w.m).nextId;
      const total = w.state(w.m).people.length;
      const key = await familyBought(w);
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
          body: expect.objectContaining({
            kind: 'stranded-people',
            key,
            people: [],
            own: [expect.objectContaining({ good: 'families', fromHost: true })],
          }),
        }),
      ]);
      if (how === 'spí') expect(await resultsOf(w, w.h)).toEqual([]);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
      await w.load(w.m, D + 1);
      familyHomeAgain(w, nextId, total);
    },
  );

  it('výsledek, který zaniklá ves už použila (výprava není ve stavu), se hostiteli nevrátí', async () => {
    // pád mezi zápisem výsledku a smazáním z odchozí schránky M: H výsledek použila a pak vymřela –
    // opakované doručení nesmí rodinu vrátit podruhé
    const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
    await familyBought(w);
    w.villages.edit(w.h, (s) => {
      s.trade = { ...s.trade!, expeditions: [] };
      s.extinctDay = s.lastDay;
    });
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(w.state(w.m).outbox).toBeUndefined();
    expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toEqual([]);
  });

  describe('úloha světa returnStrandedPeople – domov zanikl, když už výsledek ležel v jeho schránce', () => {
    it.each(['vymře', 'Začít znovu (archiv)'] as const)(
      'H %s: výsledek s lidmi jde M jako stranded-people, rodina zpět v M, podruhé nic',
      async (how) => {
        const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
        const nextId = w.state(w.m).nextId;
        const total = w.state(w.m).people.length;
        const key = await familyBought(w);
        // H žije – výsledek je v její schránce na den D + 1
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        expect(await resultsOf(w, w.h)).toHaveLength(1);
        if (how === 'vymře') {
          w.villages.edit(w.h, (s) => {
            s.extinctDay = s.lastDay;
          });
        } else {
          await w.settlements.archive(w.villages.records.get(w.h)!.settlementId);
        }
        expect(await returnStrandedPeople(w.deps)).toBe(1);
        expect(await resultsOf(w, w.h)).toEqual([]);
        expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toEqual([
          expect.objectContaining({
            day: D + 1,
            body: expect.objectContaining({ kind: 'stranded-people', key }),
          }),
        ]);
        // podruhé nic – výsledek je vyřízený, zpráva se nezdvojí
        expect(await returnStrandedPeople(w.deps)).toBe(0);
        await w.load(w.m, D + 1);
        familyHomeAgain(w, nextId, total);
      },
    );

    it('spí-li i hostitel, výsledek se zahodí – jediná přijatá ztráta (oba konce mrtvé)', async () => {
      const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
      await familyBought(w);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      for (const id of [w.h, w.m]) {
        w.villages.edit(id, (s) => {
          s.extinctDay = s.lastDay;
        });
      }
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      expect(await resultsOf(w, w.h)).toEqual([]);
      expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toEqual([]);
    });

    it('výsledek, který H použila před zánikem, se jen uklidí – rodina zůstane v H', async () => {
      const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
      await familyBought(w);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      await w.load(w.h, D + 1);
      const settled = w.state(w.h).people.length;
      w.villages.edit(w.h, (s) => {
        s.abandonedDay = s.lastDay;
      });
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      expect(await resultsOf(w, w.h)).toEqual([]);
      expect(await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS)).toEqual([]);
      expect(w.state(w.h).people).toHaveLength(settled);
    });

    it('úlohy světa (`runWorldTasks` s `villageMail`) ji pustí', async () => {
      const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
      await familyBought(w);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      w.villages.edit(w.h, (s) => {
        s.extinctDay = s.lastDay;
      });
      await runWorldTasks(
        {
          invites: new InMemoryInvites(),
          activity: new InMemoryActivity(),
          credits: new InMemoryCredits(),
          notices: new InMemoryNotices(),
          houses: new InMemoryHouses(),
          villageMail: w.deps,
        },
        { now: new Date('2027-06-01T00:00:00Z'), today: D + 1 },
      );
      expect(await resultsOf(w, w.h)).toEqual([]);
      const back = await w.villages.inbox.pending(w.m, -1, TOTAL_GAME_DAYS);
      expect(back.map((e) => e.body.kind)).toEqual(['stranded-people']);
    });

    it('živá ves si výsledek nechá – úloha světa ho nebere', async () => {
      const w = await marketWorld({ host: { ...familyHome(), lastDay: D - 1 } });
      await familyBought(w);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      expect(await resultsOf(w, w.h)).toHaveLength(1);
    });
  });

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

describe('oběh mincí (markets.md – Rozhodnutí plánu 4, bod 9)', () => {
  /** Za 30 mincí 65 kg keramiky – ves M ji prodá za 13 (0,2 mince za kg), 17 se vrátí. */
  const POTTERY: MarketOrder = { give: { coins: 30 }, wants: { pottery: 65 }, stayDays: 1 };

  /** H s 30 mincemi, M s 500 kg keramiky a bez poptávky po obilí – prodává jen za mince. */
  async function coinWorld(): Promise<MarketWorld> {
    const home = homeVillage();
    home.coins = 30;
    const host = marketVillage(0);
    host.crafts = { charcoalKg: 0, potteryKg: 500 };
    return marketWorld({ home, host });
  }

  /** Výprava H nakoupila v M – výsledek se 17 mincemi a 65 kg keramiky je v odchozí schránce M. */
  async function bought(w: MarketWorld): Promise<string> {
    const trip = await w.depart(POTTERY);
    await deliverVillageMail(w.deps, w.h);
    await w.load(w.m, D + 1);
    const { body } = w.state(w.m).outbox![0]!;
    if (body.kind !== 'market-result') throw new Error('Výsledek chybí.');
    expect(body.result).toMatchObject({ bought: { pottery: 65 }, unsold: { coins: 17 } });
    expect(w.state(w.m).coins).toBe(13);
    return trip.key;
  }

  /** Ves zanikne: vymře, opustí ji lidé, hráč začne znovu (sídlo v archivu), nebo chybí. */
  type End = 'vymřela' | 'opuštěná' | 'sídlo v archivu' | 'chybí';
  async function end(w: MarketWorld, villageId: string, how: End): Promise<void> {
    if (how === 'chybí') w.villages.records.delete(villageId);
    else if (how === 'sídlo v archivu') {
      await w.settlements.archive(w.villages.records.get(villageId)!.settlementId);
    } else {
      w.villages.edit(villageId, (s) => {
        endVillage(s, how === 'vymřela' ? 'extinctDay' : 'abandonedDay', s.lastDay);
      });
    }
  }

  /** Zprávy ve schránce vsi od začátku. */
  const inboxOf = (w: MarketWorld, villageId: string) =>
    w.villages.inbox.pending(villageId, -1, TOTAL_GAME_DAYS);

  it('výprava s 30 mincemi: součet po každém kole 30, v kronice zaplacené mince, zpět bez mincí', async () => {
    const w = await coinWorld();
    expect(await coinsOfWorld(w)).toBe(30);
    await w.depart(POTTERY);
    expect(w.state(w.h)).not.toHaveProperty('coins');
    // odeslání: mince jsou v odchozí schránce H, pak ve schránce M (záznam výpravy je nepočítá)
    expect(await coinsOfWorld(w)).toBe(30);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(await coinsOfWorld(w)).toBe(30);
    // tržní den: 13 mincí má ves M, 17 jde výsledkem domů
    await w.load(w.m, D + 1);
    expect(w.state(w.m).coins).toBe(13);
    expect(await coinsOfWorld(w)).toBe(30);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    expect(await coinsOfWorld(w)).toBe(30);
    await w.load(w.h, D + 2);
    expect(w.state(w.h).coins).toBe(17);
    expect(await coinsOfWorld(w)).toBe(30);
    const [back] = returnedOf(w.state(w.h));
    expect(back).toMatchObject({ day: D + 2, sold: { coins: 13 }, bought: { pottery: 65 } });
    expect(back!.sold).toStrictEqual({ coins: 13 });
    expect(back!.bought).toStrictEqual({ pottery: 65 });
    expect(back!.unsold).toStrictEqual({});
    // prodaná keramika stála právě tolik, kolik mincí hostitel dostal
    type Held = Extract<ChronicleEvent, { kind: 'market-held' }>;
    const held = w.state(w.m).chronicle.find((e): e is Held => e.kind === 'market-held');
    expect(held).toMatchObject({ sold: { pottery: 65 }, bought: { coins: 13 } });
    // podruhé nic
    for (const id of [w.h, w.m]) expect(await deliverVillageMail(w.deps, id)).toBe(0);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it('výprava s mincemi, která nic nekoupila: mince domů, v kronice „nic nevyměnila“', async () => {
    const w = await coinWorld();
    await w.depart({ ...POTTERY, wants: { helmets: 1 } });
    await deliverVillageMail(w.deps, w.h);
    await w.load(w.m, D + 1);
    await deliverVillageMail(w.deps, w.m);
    await w.load(w.h, D + 2);
    expect(w.state(w.h).coins).toBe(30);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({ sold: {}, bought: {}, unsold: {} }),
    ]);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it('H prodá kožešiny jiné výpravě za 12 mincí: H +12 a v kronice 12, součet světa beze změny', async () => {
    const home = homeVillage();
    home.wares = { hides: 0, sheepFurs: 22, wildFurs: 0, honeyKg: 0, waxKg: 0 };
    const w = await marketWorld({ home, host: marketVillage(0) });
    const buyer = homeVillage();
    buyer.coins = 40;
    const x = await thirdVillage(w, buyer);
    await w.depart({ give: { furs: 22 }, wants: {}, stayDays: 1 });
    await w.depart({ give: { coins: 40 }, wants: { furs: 22 }, stayDays: 1 }, x, 'W');
    const round = async (): Promise<void> => expect(await coinsOfWorld(w)).toBe(40);
    await round();
    for (const id of [w.h, x]) {
      expect(await deliverVillageMail(w.deps, id)).toBe(1);
      await round();
    }
    await w.load(w.m, D + 1);
    await round();
    expect(await deliverVillageMail(w.deps, w.m)).toBe(2);
    await round();
    for (const id of [w.h, x]) {
      await w.load(id, D + 2);
      await round();
    }
    // 22 kožešin × 8 ÷ 15 = 11,73 → 12 celých mincí; ves M sama za mince nekoupila nic
    expect(w.state(w.h).coins).toBe(12);
    expect(w.state(w.m)).not.toHaveProperty('coins');
    expect(w.state(x).coins).toBe(28);
    const [sale] = returnedOf(w.state(w.h));
    expect([sale!.sold, sale!.bought, sale!.unsold]).toStrictEqual([
      { furs: 22 },
      { coins: 12 },
      {},
    ]);
    const [purchase] = returnedOf(w.state(x));
    expect([purchase!.sold, purchase!.bought, purchase!.unsold]).toStrictEqual([
      { coins: 12 },
      { furs: 22 },
      {},
    ]);
  });

  it('M zmizela před příjezdem: výprava se vrátí se všemi mincemi v den návratu', async () => {
    const w = await coinWorld();
    const trip = await w.depart(POTTERY);
    w.villages.records.delete(w.m);
    expect(await coinsOfWorld(w)).toBe(30);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    expect(await coinsOfWorld(w)).toBe(30);
    await w.load(w.h, trip.returnDay);
    expect(w.state(w.h).coins).toBe(30);
    expect(returnedOf(w.state(w.h))).toEqual([
      expect.objectContaining({ returned: true, sold: {}, bought: {}, unsold: {} }),
    ]);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it.each(['vymřela', 'opuštěná', 'sídlo v archivu'] as const)(
    'M před příjezdem %s: po termínu se výprava vrátí se všemi mincemi, jednou',
    async (how) => {
      const w = await coinWorld();
      await w.depart(POTTERY);
      expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
      await end(w, w.m, how);
      expect(await coinsOfWorld(w)).toBe(30);
      await w.load(w.h, D + 2);
      expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
      expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
      expect(await coinsOfWorld(w)).toBe(30);
      await w.load(w.h, D + 3);
      expect(w.state(w.h).coins).toBe(30);
      expect(returnedOf(w.state(w.h))).toEqual([
        expect.objectContaining({ returned: true, sold: {}, unsold: {} }),
      ]);
      expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
      expect(await coinsOfWorld(w)).toBe(30);
    },
  );

  it('M vymře s výpravou na trhu: vrátí se 17 mincí, které drží, 13 zůstane ležet v mrtvé vsi', async () => {
    const w = await coinWorld();
    await w.depart({ ...POTTERY, stayDays: 3 });
    await deliverVillageMail(w.deps, w.h);
    await w.load(w.m, D + 1);
    expect(w.state(w.m).market!.visitors[0]!).toMatchObject({
      goods: { coins: 17 },
      coinsPaid: 13,
    });
    await end(w, w.m, 'vymřela');
    expect(await coinsOfWorld(w)).toBe(30);
    await w.load(w.h, D + 5);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
    // záznam výpravy na trhu mrtvé vsi zůstal – mince jsou ale už ve výsledku
    expect(w.state(w.m).market!.visitors).toHaveLength(1);
    expect(await coinsOfWorld(w)).toBe(30);
    await w.load(w.h, D + 6);
    expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([17, 13]);
    const [back] = returnedOf(w.state(w.h));
    expect(back).toMatchObject({ returned: true, bought: { pottery: 65 } });
    expect([back!.sold, back!.unsold]).toStrictEqual([{ coins: 13 }, {}]);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it.each(['vymřela', 'opuštěná', 'sídlo v archivu', 'chybí'] as const)(
    'H %s s výsledkem, který nese 17 mincí a žádné lidi: mince jdou zpět M, zboží zmizí',
    async (how) => {
      const w = await coinWorld();
      const key = await bought(w);
      await end(w, w.h, how);
      expect(await coinsOfWorld(w)).toBe(30);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      expect(w.state(w.m).outbox).toBeUndefined();
      const back = await inboxOf(w, w.m);
      expect(back.filter((e) => e.body.kind === 'stranded-people')).toEqual([
        expect.objectContaining({
          day: D + 2,
          body: { kind: 'stranded-people', key, people: [], coins: 17, from: undefined },
        }),
      ]);
      if (how !== 'chybí') expect(await resultsOf(w, w.h)).toEqual([]);
      expect(await coinsOfWorld(w)).toBe(30);
      // podruhé nic – ani dalším doručením, ani úlohou světa
      expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      const before = w.state(w.m);
      await w.load(w.m, D + 2);
      const after = w.state(w.m);
      expect(after.coins).toBe(30);
      // zboží výsledku (65 kg keramiky) se nevrátí a nikdo nepřišel
      expect(after.crafts!.potteryKg).toBeLessThanOrEqual(before.crafts!.potteryKg);
      expect(after.chronicle.filter((e) => e.kind === 'newcomer')).toEqual([]);
      expect(await coinsOfWorld(w)).toBe(30);
      await w.load(w.m, D + 10);
      expect(w.state(w.m).coins).toBe(30);
    },
  );

  it('výsledek s lidmi i mincemi pro zaniklou ves jde hostiteli jednou zprávou', async () => {
    const w = await coinWorld();
    const key = await bought(w);
    const man = {
      good: 'men' as const,
      people: [{ id: 5, bornDay: D - 9_000, dwellingId: 3, sex: 'male' as const }],
    };
    const origin = { villageId: w.h, villageName: 'Vlkov', direction: 'W' as const };
    w.villages.edit(w.m, (s) => {
      const { body } = s.outbox![0]!;
      if (body.kind !== 'market-result') throw new Error('Výsledek chybí.');
      Object.assign(body.result, { people: [man], origin });
    });
    await end(w, w.h, 'vymřela');
    const people = w.state(w.m).people.length;
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    const back = (await inboxOf(w, w.m)).filter((e) => e.body.kind === 'stranded-people');
    expect(back.map((e) => e.body)).toEqual([
      { kind: 'stranded-people', key, people: [man], coins: 17, from: origin },
    ]);
    await w.load(w.m, D + 2);
    expect(w.state(w.m).coins).toBe(30);
    expect(w.state(w.m).people).toHaveLength(people + 1);
  });

  it('zanikly obě vsi: mince výsledku zaniknou – jediná přijatá ztráta', async () => {
    const w = await coinWorld();
    await bought(w);
    for (const id of [w.h, w.m]) await end(w, id, 'vymřela');
    expect(await coinsOfWorld(w)).toBe(30);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(w.state(w.m).outbox).toBeUndefined();
    // zbylo jen 13 mincí, které leží v zásobě mrtvé vsi M
    expect(await coinsOfWorld(w)).toBe(13);
    expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual(['market-arrive']);
    expect(await inboxOf(w, w.h)).toEqual([]);
  });

  it('zanikly obě vsi: doručení mrtvé H výpravu z použitého příjezdu znovu nesloží', async () => {
    const w = await coinWorld();
    await bought(w);
    // H je po termínu, výsledek ještě nepřišel – pak vymřou obě a výsledek zanikne s nimi
    await w.load(w.h, D + 5);
    for (const id of [w.h, w.m]) await end(w, id, 'vymřela');
    // mrtvá H by nic nepoužila – kvůli výpravě po termínu se nenačítá
    expect(hasVillageMail(w.state(w.h))).toBe(false);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(await coinsOfWorld(w)).toBe(13);
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(await inboxOf(w, w.h)).toEqual([]);
    expect(await coinsOfWorld(w)).toBe(13);
  });

  it.each(['vymřela', 'opuštěná'] as const)(
    'H %s s výpravou po termínu poštu nemá – odchozí schránku doručí dál',
    async (how) => {
      const w = await coinWorld();
      await w.depart(POTTERY);
      const mail = structuredClone(w.state(w.h).outbox!);
      await deliverVillageMail(w.deps, w.h);
      await w.load(w.h, D + 5);
      expect(hasVillageMail(w.state(w.h))).toBe(true);
      await end(w, w.h, how);
      expect(w.state(w.h).trade!.expeditions).toHaveLength(1);
      expect(hasVillageMail(w.state(w.h))).toBe(false);
      w.villages.edit(w.h, (s) => {
        s.outbox = mail;
      });
      expect(hasVillageMail(w.state(w.h))).toBe(true);
    },
  );

  it('mrtvá H po termínu si výsledek od živé M nevezme – mince vrátí M sama, jednou', async () => {
    const w = await coinWorld();
    await bought(w);
    await w.load(w.h, D + 5);
    await end(w, w.h, 'vymřela');
    expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
    expect(await resultsOf(w, w.h)).toEqual([]);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    await w.load(w.m, D + 2);
    expect(w.state(w.m).coins).toBe(30);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it('výsledek, který zaniklá H už použila, se M nevrátí – mince by se zdvojily', async () => {
    const w = await coinWorld();
    await bought(w);
    const result = structuredClone(w.state(w.m).outbox);
    // pád mezi zápisem výsledku a smazáním z odchozí schránky M
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    w.villages.edit(w.m, (s) => {
      s.outbox = result!;
    });
    await w.load(w.h, D + 2);
    expect(w.state(w.h).coins).toBe(17);
    expect(await coinsOfWorld(w)).toBe(30);
    await end(w, w.h, 'vymřela');
    expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
    expect(await returnStrandedPeople(w.deps)).toBe(0);
    expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual(['market-arrive']);
    expect(w.state(w.m).coins).toBe(13);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it('souběh: dvě doručení a úloha světa najednou vrátí mince jednou', async () => {
    const w = await coinWorld();
    await bought(w);
    await end(w, w.h, 'vymřela');
    const written = await Promise.all([
      deliverVillageMail(w.deps, w.m),
      deliverVillageMail(w.deps, w.m),
      returnStrandedPeople(w.deps),
    ]);
    expect(written.reduce((a, b) => a + b, 0)).toBe(1);
    await w.load(w.m, D + 2);
    expect(w.state(w.m).coins).toBe(30);
    expect(await coinsOfWorld(w)).toBe(30);
  });

  it.each(['žije', 'vymřela'] as const)(
    'kola workeru obou hráčů, H %s: součet po každém kole 30, mince dojdou jednou',
    async (how) => {
      const w = await coinWorld();
      await w.depart(POTTERY);
      for (let day = D + 1; day <= D + 5; day++) {
        for (const playerId of [H_PLAYER, M_PLAYER]) {
          await advancePlayer(w.deps, { playerId, today: day, stepDays: 10 });
          expect(await coinsOfWorld(w)).toBe(30);
        }
        // výsledek už leží ve schránce H (den D + 2)
        if (day === D + 1 && how === 'vymřela') {
          expect(await resultsOf(w, w.h)).toHaveLength(1);
          await end(w, w.h, 'vymřela');
        }
        await returnStrandedPeople(w.deps);
        expect(await coinsOfWorld(w)).toBe(30);
      }
      const [h, m] = [w.state(w.h), w.state(w.m)];
      expect([h.coins, m.coins]).toEqual(how === 'žije' ? [17, 13] : [undefined, 30]);
      expect([h.outbox, m.outbox]).toEqual([undefined, undefined]);
    },
  );

  it('výsledek živé H se nevrací – mince přijdou domů', async () => {
    const w = await coinWorld();
    await bought(w);
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    expect(await returnStrandedPeople(w.deps)).toBe(0);
    expect(await resultsOf(w, w.h)).toHaveLength(1);
    expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual(['market-arrive']);
  });

  describe('úloha světa returnStrandedPeople – H zanikla s výsledkem ve schránce', () => {
    it.each(['vymřela', 'opuštěná', 'sídlo v archivu'] as const)(
      'H %s: 17 mincí jde M jako stranded-people, podruhé nic',
      async (how) => {
        const w = await coinWorld();
        const key = await bought(w);
        // H ještě žije – výsledek je v její schránce na den D + 2
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        expect(await resultsOf(w, w.h)).toHaveLength(1);
        await end(w, w.h, how);
        expect(await coinsOfWorld(w)).toBe(30);
        expect(await returnStrandedPeople(w.deps)).toBe(1);
        expect(await resultsOf(w, w.h)).toEqual([]);
        const back = (await inboxOf(w, w.m)).filter((e) => e.body.kind === 'stranded-people');
        expect(back).toEqual([
          expect.objectContaining({
            day: D + 2,
            body: expect.objectContaining({ key, people: [], coins: 17 }),
          }),
        ]);
        expect(await coinsOfWorld(w)).toBe(30);
        expect(await returnStrandedPeople(w.deps)).toBe(0);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
        await w.load(w.m, D + 2);
        expect(w.state(w.m).coins).toBe(30);
        expect(await coinsOfWorld(w)).toBe(30);
      },
    );

    it('krok 1 pošty je poslal dřív (pád před smazáním): úloha nic nezdvojí, jen uklidí', async () => {
      const w = await coinWorld();
      await bought(w);
      const result = structuredClone(w.state(w.m).outbox);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      w.villages.edit(w.m, (s) => {
        s.outbox = result!;
      });
      await end(w, w.h, 'vymřela');
      // výsledek leží ve schránce mrtvé H i v odchozí schránce M
      expect(await coinsOfWorld(w)).toBe(30);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      expect(await coinsOfWorld(w)).toBe(30);
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      expect(await resultsOf(w, w.h)).toEqual([]);
      await w.load(w.m, D + 2);
      expect(w.state(w.m).coins).toBe(30);
      expect(await coinsOfWorld(w)).toBe(30);
    });

    it('dva výsledky téže zaniklé vsi: domov načte jednou, vrátí oba', async () => {
      const w = await coinWorld();
      for (let i = 0; i < 2; i++) {
        await w.depart({ give: { coins: 15 }, wants: { pottery: 5 }, stayDays: 1 });
      }
      await deliverVillageMail(w.deps, w.h);
      await w.load(w.m, D + 1);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(2);
      await end(w, w.h, 'vymřela');
      expect(await w.villages.inbox.strandedResults()).toHaveLength(2);
      const finds = w.villages.finds;
      expect(await returnStrandedPeople(w.deps)).toBe(2);
      // H jednou, hostitel M u každého výsledku (může mezitím zaniknout)
      expect(w.villages.finds - finds).toBe(1 + 2);
      expect(await resultsOf(w, w.h)).toEqual([]);
      await w.load(w.m, D + 2);
      expect(w.state(w.m).coins).toBe(30);
      expect(await coinsOfWorld(w)).toBe(30);
    });

    it('zanikl-li i hostitel, mince se ztratí a výsledek se uklidí – oba konce mrtvé', async () => {
      const w = await coinWorld();
      await bought(w);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      await end(w, w.h, 'vymřela');
      await end(w, w.m, 'sídlo v archivu');
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      expect(await resultsOf(w, w.h)).toEqual([]);
      expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual(['market-arrive']);
      expect(await coinsOfWorld(w)).toBe(13);
    });

    it('výsledek bez mincí a bez lidí úloha nechá ležet', async () => {
      const w = await marketWorld();
      await w.depart(ORDER);
      await deliverVillageMail(w.deps, w.h);
      await w.load(w.m, D + 1);
      expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
      await end(w, w.h, 'vymřela');
      expect(await returnStrandedPeople(w.deps)).toBe(0);
      expect(await resultsOf(w, w.h)).toHaveLength(1);
      expect(await w.villages.inbox.strandedResults()).toEqual([]);
    });
  });

  it('mince zpět ve schránce hostitele, který zanikne dřív, než je použije: oba konce mrtvé', async () => {
    const w = await coinWorld();
    await bought(w);
    await end(w, w.h, 'vymřela');
    expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
    await end(w, w.m, 'vymřela');
    expect(await returnStrandedPeople(w.deps)).toBe(0);
    await w.load(w.m, D + 2);
    expect(w.state(w.m).coins).toBe(13);
  });

  it('cizí kupec na trhu: součet světa počítá jeho měšec jen v živé vsi', async () => {
    const w = await coinWorld();
    const stand = (villageId: string): void =>
      w.villages.edit(villageId, (s) => {
        s.market = {
          prices: {},
          visitors: [
            {
              key: 'merchants:0,0,E:601:2',
              fromVillageId: '',
              fromName: '',
              order: 1,
              arrivedDay: D,
              lastDay: D + 1,
              travelDays: 0,
              goods: { swords: 2, coins: 60 },
              horses: [],
              wants: { wax: 24 },
              sold: {},
              bought: {},
              boughtHorses: [],
              merchant: true,
            },
          ],
          nextOrder: 2,
          arrivals: [],
        };
      });
    stand(w.m);
    expect(await coinsOfWorld(w)).toBe(30 + 60);
    await end(w, w.m, 'sídlo v archivu');
    expect(await coinsOfWorld(w)).toBe(30);
    for (const how of ['vymřela', 'opuštěná'] as const) {
      const dead = await coinWorld();
      dead.villages.edit(dead.m, (s) => {
        s.market = structuredClone(w.state(w.m).market!);
      });
      expect(await coinsOfWorld(dead)).toBe(30 + 60);
      await end(dead, dead.m, how);
      expect(await coinsOfWorld(dead)).toBe(30);
    }
  });

  describe('úklid vyřízené pošty výprav (Rozhodnutí plánu 4, bod 10)', () => {
    /** Den řádků ve schránce M a den, od kterého je smí úklid smazat – o `MAIL_KEEP_DAYS` později. */
    const OLD = D + 10;
    const NOW = OLD + MAIL_KEEP_DAYS;

    /** Zpráva výpravy `key` pro M na den `day`; `from` = kdo ji vydal (bez něj starší řádek). */
    function tripMail(
      w: MarketWorld,
      kind: 'market-arrive' | 'market-result',
      key: string,
      from?: string,
      day = OLD,
    ): VillageMail {
      const sender = from === undefined ? {} : { from };
      if (kind === 'market-result') {
        const result: MarketResult = { key, sold: {}, bought: {}, unsold: {}, horses: [] };
        return {
          villageId: w.m,
          day,
          ref: marketResultRef(key),
          body: { kind, result, ...sender },
        };
      }
      const arrival: MarketArrival = {
        key,
        fromVillageId: w.h,
        fromName: 'Vlkov',
        stayDays: 1,
        travelDays: 0,
        goods: {},
        horses: [],
        wants: {},
        report,
      };
      return {
        villageId: w.m,
        day,
        ref: marketArrivalRef(key),
        body: { kind, arrival, ...sender },
      };
    }

    /** Vsi v den `day` bez simulace – události do něj jsou použité. */
    function jump(w: MarketWorld, day: number, ...villageIds: string[]): void {
      for (const id of villageIds) {
        w.villages.edit(id, (s) => {
          s.lastDay = day;
        });
      }
    }

    /** Příjezd výpravy H a výsledek výpravy M u hostitele H ve schránce M na den `OLD`. */
    async function postBoth(w: MarketWorld): Promise<void> {
      await w.villages.inbox.post(tripMail(w, 'market-arrive', `market:${w.h}:71`, w.h));
      await w.villages.inbox.post(tripMail(w, 'market-result', `market:${w.m}:72`, w.h));
    }

    it('příjezd i výsledek od vsi, která je o rok dál, smaže – verzi vsi nezvedne', async () => {
      expect([MAIL_KEEP_DAYS, MAIL_PRUNE_ROWS]).toEqual([365, 500]);
      const w = await marketWorld();
      await postBoth(w);
      jump(w, NOW, w.h, w.m);
      const version = w.version(w.m);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(2);
      expect(await inboxOf(w, w.m)).toEqual([]);
      expect(w.version(w.m)).toBe(version);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(0);
    });

    it.each(['o den pozadu', 'vymřela', 'opuštěná', 'chybí'] as const)(
      'odesílatel H %s: řádky zůstanou',
      async (how) => {
        const w = await marketWorld();
        await postBoth(w);
        jump(w, NOW, w.m);
        jump(w, how === 'o den pozadu' ? NOW - 1 : NOW + 100, w.h);
        if (how !== 'o den pozadu') await end(w, w.h, how);
        expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(0);
        expect(await inboxOf(w, w.m)).toHaveLength(2);
      },
    );

    it('starší řádky bez `from`: příjezd má odesílatele v `ref`, výsledek ne a zůstane', async () => {
      const w = await marketWorld();
      await w.villages.inbox.post(tripMail(w, 'market-arrive', `market:${w.h}:71`));
      await w.villages.inbox.post(tripMail(w, 'market-result', `market:${w.m}:72`));
      jump(w, NOW, w.h, w.m);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(1);
      expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual(['market-result']);
      // odesílatel z `ref` platí i pro příjezd – H pozadu ho nechá
      await w.villages.inbox.post(
        tripMail(w, 'market-arrive', `market:${w.h}:73`, undefined, NOW + 1),
      );
      jump(w, NOW + 1 + MAIL_KEEP_DAYS, w.m);
      jump(w, NOW + MAIL_KEEP_DAYS, w.h);
      expect(await pruneSettledMail(w.deps, w.m, NOW + 1 + MAIL_KEEP_DAYS)).toBe(0);
    });

    it('řádek, který nemá rok (den > afterDay − 365), zůstane i s H daleko napřed', async () => {
      const w = await marketWorld();
      await postBoth(w);
      jump(w, NOW + 5_000, w.h);
      jump(w, NOW - 1, w.m);
      expect(await pruneSettledMail(w.deps, w.m, NOW - 1)).toBe(0);
      jump(w, NOW, w.m);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(2);
    });

    it('jiných druhů se nedotkne – ani lidí a mincí zpět (`stranded-people`)', async () => {
      const w = await marketWorld();
      const key = `market:${w.h}:74`;
      const asked = { fromVillageId: w.h, fromName: 'Vlkov', cells: 1, firstStep: 'E' as const };
      const others: VillageMail[] = [
        {
          villageId: w.m,
          day: OLD,
          ref: `kin:${w.h}:${OLD}:20:ask`,
          body: {
            kind: 'kin-ask',
            ask: {
              key: `kin:${w.h}:${OLD}:20`,
              ...asked,
              seeker: { personId: 20, sex: 'male', bornDay: OLD - 9_500, widowed: false },
              report,
            },
          },
        },
        {
          villageId: w.m,
          day: OLD,
          ref: `smith:${w.h}:${OLD}:ask`,
          body: {
            kind: 'smith-ask',
            ask: { key: `smith:${w.h}:${OLD}`, ...asked, horses: 1, report },
          },
        },
        {
          villageId: w.m,
          day: OLD,
          ref: `${marketResultRef(key)}:back`,
          body: { kind: 'stranded-people', key, people: [], coins: 17, from: undefined },
        },
        {
          villageId: w.m,
          day: OLD,
          ref: `order:${w.h}:${w.m}:tools:${OLD}`,
          body: {
            kind: 'order-ready',
            ready: { villageId: w.h, name: 'Vlkov', good: 'tools', amount: 5 },
          },
        },
      ];
      for (const mail of others) await w.villages.inbox.post(mail);
      await postBoth(w);
      jump(w, NOW, w.h, w.m);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(2);
      expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual([
        'kin-ask',
        'smith-ask',
        'stranded-people',
        'order-ready',
      ]);
      // úklid snímků okolí a zpráv bez nákladu (`pruneUsed`) maže dál jen svoje druhy
      expect(await w.villages.inbox.pruneUsed(w.m, OLD)).toBe(3);
      expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual(['stranded-people']);
    });

    it('mez až po filtru: 600 starších od zaniklé vsi úklid 20 bezpečných nezdrží', async () => {
      const w = await marketWorld();
      const dead = await thirdVillage(w, marketVillage());
      for (let i = 0; i < 600; i++) {
        await w.villages.inbox.post(
          tripMail(w, 'market-arrive', `market:${dead}:${i}`, dead, OLD - 5),
        );
      }
      for (let i = 0; i < 20; i++) {
        await w.villages.inbox.post(tripMail(w, 'market-arrive', `market:${w.h}:${i}`, w.h));
      }
      await end(w, dead, 'vymřela');
      jump(w, NOW, w.h, w.m, dead);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(20);
      const left = await inboxOf(w, w.m);
      expect(left).toHaveLength(600);
      expect(new Set(left.map((e) => e.day))).toEqual(new Set([OLD - 5]));
    });

    it('nejvýš MAIL_PRUNE_ROWS nejstarších na jedno volání: 620 bezpečných → 500, pak 120', async () => {
      const w = await marketWorld();
      for (let i = 0; i < 620; i++) {
        // po 155 na den, novější napřed – o pořadí rozhoduje den, ne zápis
        await w.villages.inbox.post(
          tripMail(w, 'market-arrive', `market:${w.h}:${i}`, w.h, OLD - (i % 4)),
        );
      }
      jump(w, NOW, w.h, w.m);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(500);
      const left = await inboxOf(w, w.m);
      expect(left).toHaveLength(120);
      expect(new Set(left.map((e) => e.day))).toEqual(new Set([OLD]));
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(120);
      expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(0);
    });

    describe('kdo zprávu vydal (`from`)', () => {
      it('příjezd domovská ves, výsledek hostitel – v odchozí schránce ještě není', async () => {
        const w = await coinWorld();
        await bought(w);
        expect((await inboxOf(w, w.m)).map((e) => e.body)).toEqual([
          expect.objectContaining({ kind: 'market-arrive', from: w.h }),
        ]);
        expect(w.state(w.m).outbox![0]!.body).not.toHaveProperty('from');
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        expect((await inboxOf(w, w.h)).map((e) => e.body)).toEqual([
          expect.objectContaining({ kind: 'market-result', from: w.m }),
        ]);
      });

      it('výsledek z odchozí schránky hostitele, který zapíše domov (krok 3): hostitel', async () => {
        const w = await coinWorld();
        await bought(w);
        await w.load(w.h, D + 5);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
        expect((await inboxOf(w, w.h)).map((e) => e.body)).toEqual([
          expect.objectContaining({ kind: 'market-result', from: w.m }),
        ]);
      });

      it.each(['chybí', 'vymřela'] as const)('M %s: vrácenou výpravu vydal domov', async (how) => {
        const w = await coinWorld();
        const trip = await w.depart(POTTERY);
        if (how === 'vymřela') expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
        await end(w, w.m, how);
        await w.load(w.h, trip.returnDay);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
        expect((await inboxOf(w, w.h)).map((e) => e.body)).toEqual([
          expect.objectContaining({
            kind: 'market-result',
            from: w.h,
            result: expect.objectContaining({ returned: true }),
          }),
        ]);
        // po roce ji smí H smazat ze své schránky – výpravu už nečeká a nic znovu nepošle
        await w.load(w.h, trip.returnDay + 2);
        expect(w.state(w.h).coins).toBe(30);
        const later = trip.returnDay + 2 + MAIL_KEEP_DAYS;
        jump(w, later, w.h);
        expect(await pruneSettledMail(w.deps, w.h, later)).toBe(1);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        expect(await coinsOfWorld(w)).toBe(30);
      });

      it('zprávy bez nákladu a lidé zpět hostiteli odesílatele nedostanou', async () => {
        const w = await coinWorld();
        const key = await bought(w);
        await end(w, w.h, 'vymřela');
        w.villages.edit(w.m, (s) => {
          s.outbox!.push({
            villageId: w.m,
            day: D + 5,
            ref: `order:${w.m}:${w.m}:tools:${D}`,
            body: {
              kind: 'order-ready',
              ready: { villageId: w.m, name: 'Lhota', good: 'tools', amount: 5 },
            },
          });
        });
        expect(await deliverVillageMail(w.deps, w.m)).toBe(2);
        const bodies = (await inboxOf(w, w.m)).map((e) => e.body);
        expect(bodies.find((b) => b.kind === 'stranded-people')).toEqual({
          kind: 'stranded-people',
          key,
          people: [],
          coins: 17,
          from: undefined,
        });
        expect(bodies.find((b) => b.kind === 'order-ready')).not.toHaveProperty('from');
      });
    });

    describe('odesílatel, který zprávu může poslat znovu', () => {
      it('pád mezi zápisem a vyčištěním, H pozadu: příjezd zůstane, po dopočtu H se smaže', async () => {
        const w = await coinWorld();
        await w.depart(POTTERY);
        const mail = structuredClone(w.state(w.h).outbox!);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
        w.villages.edit(w.h, (s) => {
          s.outbox = structuredClone(mail);
        });
        // M výpravu vyřídila a je o rok dál, H stojí
        await w.load(w.m, D + 1);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        const later = D + 1 + MAIL_KEEP_DAYS;
        await w.load(w.m, later);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
        expect(await w.villages.inbox.post(mail[0]!)).toBeNull();
        // H se dopočetla: výsledek použila, odchozí schránku vyčistila a je o rok dál
        await w.load(w.h, D + 5);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        expect(w.state(w.h).outbox).toBeUndefined();
        await w.load(w.h, later);
        expect(hasVillageMail(w.state(w.h))).toBe(false);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(1);
        expect(await inboxOf(w, w.m)).toEqual([]);
        // nic se znovu nepošle a nezdvojí
        expect([hasVillageMail(w.state(w.h)), hasVillageMail(w.state(w.m))]).toEqual([
          false,
          false,
        ]);
        for (const id of [w.h, w.m]) expect(await deliverVillageMail(w.deps, id)).toBe(0);
        await w.load(w.m, later + 5);
        await w.load(w.h, later + 5);
        expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([17, 13]);
        expect(await coinsOfWorld(w)).toBe(30);
      }, 20_000);

      it('H přeskočí rok v jednom dopočtu dřív, než se její odchozí schránka vyčistí: příjezd zůstane', async () => {
        const w = await coinWorld();
        await w.depart(POTTERY);
        const mail = structuredClone(w.state(w.h).outbox!);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
        w.villages.edit(w.h, (s) => {
          s.outbox = structuredClone(mail);
        });
        await w.load(w.m, D + 1);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        // dlouhá nepřítomnost: H se dopočte o víc než rok naráz, výsledek použije a příjezd v odchozí
        // schránce ještě nese (doručí se až po dopočtu všech vsí hráče)
        const later = D + 5 + MAIL_KEEP_DAYS;
        await w.load(w.m, later);
        await w.load(w.h, later);
        expect(w.state(w.h).outbox).toEqual(mail);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
        // druhé doručení se zahodí – mince nepřijedou podruhé; pak řádek smí pryč
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(1);
        for (const id of [w.m, w.h]) await w.load(id, later + 5);
        expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([17, 13]);
        expect(w.state(w.m).market!.visitors).toEqual([]);
        expect(await coinsOfWorld(w)).toBe(30);
      }, 20_000);

      it('M přeskočí rok s výsledkem, který už zapsala, v odchozí schránce: výsledek v H zůstane', async () => {
        const w = await coinWorld();
        await bought(w);
        const mail = structuredClone(w.state(w.m).outbox!);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        w.villages.edit(w.m, (s) => {
          s.outbox = structuredClone(mail);
        });
        const later = D + 5 + MAIL_KEEP_DAYS;
        await w.load(w.h, later);
        await w.load(w.m, later);
        expect(w.state(w.m).outbox).toEqual(mail);
        expect(await pruneSettledMail(w.deps, w.h, later)).toBe(0);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
        expect(await pruneSettledMail(w.deps, w.h, later)).toBe(1);
        for (const id of [w.h, w.m]) await w.load(id, later + 5);
        expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([17, 13]);
        expect(returnedOf(w.state(w.h))).toHaveLength(1);
        expect(await coinsOfWorld(w)).toBe(30);
      }, 20_000);

      it('ves bez souhrnu (uložená před ním) se bere, jako by zprávu ještě mohla poslat', async () => {
        const w = await marketWorld();
        await postBoth(w);
        jump(w, NOW, w.h, w.m);
        w.villages.withoutDigest.add(w.h);
        expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(0);
        w.villages.withoutDigest.clear();
        expect(await pruneSettledMail(w.deps, w.m, NOW)).toBe(2);
      });

      it('souběh: dva úklidy, dvě doručení a úloha světa najednou smažou řádek jednou', async () => {
        const w = await coinWorld();
        await bought(w);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        const later = D + 5 + MAIL_KEEP_DAYS;
        for (const id of [w.h, w.m]) await w.load(id, later);
        const [a, b, ...mail] = await Promise.all([
          pruneSettledMail(w.deps, w.m, later),
          pruneSettledMail(w.deps, w.m, later),
          deliverVillageMail(w.deps, w.h),
          deliverVillageMail(w.deps, w.m),
          returnStrandedPeople(w.deps),
        ]);
        expect(a + b).toBe(1);
        expect(mail).toEqual([0, 0, 0]);
        expect(await inboxOf(w, w.m)).toEqual([]);
        for (const id of [w.h, w.m]) await w.load(id, later + 5);
        expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([17, 13]);
        expect(await coinsOfWorld(w)).toBe(30);
      }, 20_000);
    });

    describe('výprava po termínu (krok 3) po úklidu příjezdu', () => {
      /** Id řádku příjezdu ve schránce M. */
      async function arrivalId(w: MarketWorld): Promise<string> {
        const row = (await inboxOf(w, w.m)).find((e) => e.body.kind === 'market-arrive');
        if (!row) throw new Error('Příjezd ve schránce M není.');
        return row.id;
      }

      it.each(['vymřela', 'opuštěná', 'sídlo v archivu'] as const)(
        'pobyt 400 dní: příjezd zůstane, dokud výprava stojí na trhu; M %s – vrátí se jednou s tím, co drží',
        async (how) => {
          const w = await coinWorld();
          const trip = await w.depart({ ...POTTERY, stayDays: 400 });
          await deliverVillageMail(w.deps, w.h);
          // rok a půl měsíce na trhu – příjezd (D + 1) už rok má, výsledek ještě nepřišel
          const later = D + 380;
          await w.load(w.m, later);
          await w.load(w.h, later);
          expect(w.state(w.m).market!.visitors).toHaveLength(1);
          expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
          await end(w, w.m, how);
          await w.load(w.h, trip.returnDay);
          expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
          expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
          await w.load(w.h, trip.returnDay + 1);
          expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([17, 13]);
          // výprava je vyřízená, o dalšího půl druhého roku později se nevrátí podruhé
          const end2 = trip.returnDay + 1 + MAIL_KEEP_DAYS;
          jump(w, end2, w.h);
          expect(await pruneSettledMail(w.deps, w.h, end2)).toBe(1);
          expect(hasVillageMail(w.state(w.h))).toBe(false);
          expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
          expect(returnedOf(w.state(w.h))).toHaveLength(1);
          expect(await coinsOfWorld(w)).toBe(30);
        },
        20_000,
      );

      it('hostitel pomalejší než domov: příjezd zůstane, dokud domov výsledek nepoužije', async () => {
        const w = await coinWorld();
        await w.depart(POTTERY);
        await deliverVillageMail(w.deps, w.h);
        await w.load(w.h, D + 800);
        // M je o víc než rok za příjezdem, ale 400 dní za H; výsledek ještě leží v její schránce
        const later = D + 400;
        await w.load(w.m, later);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        // výsledek leží ve schránce H na den D + 801, výprava je pořád po termínu
        expect(hasVillageMail(w.state(w.h))).toBe(true);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        await w.load(w.h, D + 801);
        expect(w.state(w.h).coins).toBe(17);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(1);
        // M zanikne: živá ani mrtvá H výpravu podruhé nevrátí
        await end(w, w.m, 'vymřela');
        await w.load(w.h, D + 810);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        await end(w, w.h, 'vymřela');
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        expect(await returnStrandedPeople(w.deps)).toBe(0);
        expect(await inboxOf(w, w.m)).toEqual([]);
        expect(returnedOf(w.state(w.h))).toHaveLength(1);
        expect(await coinsOfWorld(w)).toBe(30);
      }, 20_000);

      it('příjezd, který hostitel na cestě přeskočil, zůstane – po jeho zániku se výprava vrátí', async () => {
        const w = await coinWorld();
        await w.depart(POTTERY);
        await deliverVillageMail(w.deps, w.h);
        // v den příjezdu je M na cestě – události těch dnů dopočet nepoužije
        w.villages.edit(w.m, (s) => {
          s.journey = { direction: 'E', departedDay: D - 5, arrivalDay: D + 5 };
        });
        await w.load(w.m, D + 5);
        w.villages.edit(w.m, (s) => {
          delete s.journey;
        });
        const later = D + 10 + MAIL_KEEP_DAYS;
        jump(w, later, w.h, w.m);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
        await end(w, w.m, 'vymřela');
        expect(await deliverVillageMail(w.deps, w.h)).toBe(1);
        await w.load(w.h, later + 1);
        expect(w.state(w.h).coins).toBe(30);
        expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
        expect(await coinsOfWorld(w)).toBe(30);
      });

      // příjezd zmizel dřív, než byla výprava vyřízená (úklid to nedělá) – krok 3 ani tak nic nezdvojí
      it.each([
        ['stojí na trhu', 'žije'],
        ['stojí na trhu', 'vymřela'],
        ['má výsledek v odchozí schránce M', 'žije'],
        ['má výsledek v odchozí schránce M', 'vymřela'],
        ['má výsledek ve schránce H', 'žije'],
        ['má výsledek ve schránce H', 'vymřela'],
      ] as const)(
        'smazaný příjezd, výprava %s, M vymře, H %s: nejvýš jeden návrat',
        async (where, home) => {
          const w = await coinWorld();
          const stayDays = where === 'stojí na trhu' ? 10 : 1;
          const trip = await w.depart({ ...POTTERY, stayDays });
          await deliverVillageMail(w.deps, w.h);
          await w.load(w.m, D + 3);
          await w.load(w.h, trip.returnDay + 3);
          if (where === 'má výsledek ve schránce H') {
            expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
          }
          expect(await w.villages.inbox.dropSettledMail(w.m, [await arrivalId(w)])).toBe(1);
          await end(w, w.m, 'vymřela');
          if (home === 'vymřela') await end(w, w.h, home);
          const waiting = home === 'žije' && where !== 'má výsledek ve schránce H';
          expect(await deliverVillageMail(w.deps, w.h)).toBe(waiting ? 1 : 0);
          expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
          await w.load(w.h, trip.returnDay + 4);
          expect(await deliverVillageMail(w.deps, w.h)).toBe(0);
          expect(returnedOf(w.state(w.h))).toHaveLength(home === 'žije' ? 1 : 0);
          expect([w.state(w.h).coins, w.state(w.m).coins]).toEqual([
            home === 'žije' ? 17 : undefined,
            13,
          ]);
          // mrtvé oběma konci mince nikdo nepřipíše, ale ani nezdvojí
          expect(await coinsOfWorld(w)).toBe(30);
        },
      );

      it('zprávu `stranded-people` úklid nesmaže – druhé vrácení mincí se zahodí', async () => {
        const w = await coinWorld();
        await bought(w);
        const mail = structuredClone(w.state(w.m).outbox!);
        await end(w, w.h, 'vymřela');
        expect(await deliverVillageMail(w.deps, w.m)).toBe(1);
        // pád před smazáním z odchozí schránky, M o víc než rok dál (mince zpět už má)
        w.villages.edit(w.m, (s) => {
          s.outbox = structuredClone(mail);
        });
        const later = D + 10 + MAIL_KEEP_DAYS;
        await w.load(w.m, later);
        expect(w.state(w.m).coins).toBe(30);
        expect(await pruneSettledMail(w.deps, w.m, later)).toBe(0);
        expect((await inboxOf(w, w.m)).map((e) => e.body.kind)).toEqual([
          'market-arrive',
          'stranded-people',
        ]);
        expect(await deliverVillageMail(w.deps, w.m)).toBe(0);
        await w.load(w.m, later + 5);
        expect(w.state(w.m).coins).toBe(30);
        expect(await coinsOfWorld(w)).toBe(30);
      }, 20_000);
    });
  });
});
