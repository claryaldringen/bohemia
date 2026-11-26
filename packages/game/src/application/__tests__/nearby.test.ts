import { describe, expect, it, vi } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { NearbyVillage } from '../../domain/village';
import { dwelling, kin } from '../../domain/village/__tests__/kin-fixtures';
import { kinSingles } from '../../domain/village/people/kin-match';
import { D, homeVillage } from '../../domain/village/trade/__tests__/market-fixtures';
import { NEARBY_KEEP_DAYS, NEARBY_REFRESH_DAYS, nearbyDays, nearbyVillages } from '../nearby';
import { updateVillage } from '../update-village';
import { MAIL_KEEP_DAYS, returnStrandedPeople } from '../village-mail';
import { H_PLAYER, landscape, marketWorld, type MarketWorld } from './market-world';

// Okolí vsi (markets.md – Rozhodnutí plánu 3, bod 1): vsi na 8 sousedních mapách – i vsi vlastního
// hráče, bez spících, archivovaných a odříznutých – zapsané v pevné dny kalendáře před dopočtem přes
// ně. Svět `marketWorld()`: Vlkov (H, 0,0, dopočtená do D) a Lhota (M, 1,0, do D − 1).

/** První den obnovy okolí po D – den kalendáře dělitelný `NEARBY_REFRESH_DAYS`. */
const K = D + 24;

const LHOTA: NearbyVillage = { villageId: 'village-2', name: 'Lhota', cells: 1, firstStep: 'E' };

/** Svět H a M s okolím (`villages.nearby` jako úložiště v DB). */
async function nearbyWorld(): Promise<MarketWorld> {
  const w = await marketWorld();
  w.villages.withNearby(w.settlements);
  return w;
}

/** Dny událostí `nearby` ve schránce vsi (všechny dny). */
async function eventDays(w: MarketWorld, villageId: string): Promise<number[]> {
  const all = await w.villages.inbox.pending(villageId, -1, TOTAL_GAME_DAYS);
  return all.filter((e) => e.body.kind === 'nearby').map((e) => e.day);
}

/** Sídlo hráče `ownerId` s živou vsí `name` na políčku mapy světa (x, y). */
async function addVillage(
  w: MarketWorld,
  ownerId: string,
  name: string,
  cell: { x: number; y: number },
): Promise<string> {
  const settlement = (await w.settlements.create({
    ownerId,
    landscapeSeed: 30 + cell.x,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: cell,
  }))!;
  return (await w.villages.add(settlement.id, name, homeVillage())).id;
}

/** Sídlo vsi `villageId` se stane odříznutým (nováček – jen místní mřížka). */
function isolate(w: MarketWorld, villageId: string): void {
  const settlementId = w.villages.records.get(villageId)!.settlementId;
  const i = w.settlements.settlements.findIndex((s) => s.id === settlementId);
  const settlement = w.settlements.settlements[i]!;
  w.settlements.settlements[i] = {
    ...settlement,
    localCell: settlement.worldCell,
    worldCell: null,
  };
}

/** Okolí vsi `villageId` podle `nearbyVillages` (záznam vsi předaný parametrem). */
function around(w: MarketWorld, villageId: string): Promise<NearbyVillage[]> {
  return nearbyVillages(w.deps, w.villages.records.get(villageId)!);
}

describe('nearbyDays – pevné dny obnovy', () => {
  it('dny kalendáře dělitelné mezí v (po, do]', () => {
    expect(NEARBY_REFRESH_DAYS).toBe(30);
    expect(K % NEARBY_REFRESH_DAYS).toBe(0);
    expect(nearbyDays(D, K - 1)).toEqual([]);
    expect(nearbyDays(D, K)).toEqual([K]);
    expect(nearbyDays(K - 1, K + 1)).toEqual([K]);
    expect(nearbyDays(K, K + NEARBY_REFRESH_DAYS - 1)).toEqual([]);
    expect(nearbyDays(K - 1, K + 2 * NEARBY_REFRESH_DAYS)).toEqual([K, K + 30, K + 60]);
  });
});

describe('nearbyVillages – vsi na 8 sousedních mapách bez načtení stavů', () => {
  it('soused s políčky a prvním krokem, jméno z otisku – žádná ves se nenačte celá', async () => {
    const w = await marketWorld();
    expect(w.m).toBe(LHOTA.villageId);
    const finds = w.villages.finds;
    const stamps = w.villages.stampQueries;
    expect(await around(w, w.h)).toEqual([LHOTA]);
    expect(await around(w, w.m)).toEqual([
      { villageId: w.h, name: 'Vlkov', cells: 1, firstStep: 'W' },
    ]);
    expect(w.villages.finds).toBe(finds);
    expect(w.villages.stampQueries - stamps).toBe(2);
  });

  it('i vsi vlastního hráče, jen prstenec 1, řazeno podle políček, pak id vsi', async () => {
    const w = await marketWorld();
    const own = await addVillage(w, H_PLAYER, 'Dolní', { x: 0, y: 1 });
    const other = await addVillage(w, 'hrac-x', 'Hora', { x: -1, y: -1 });
    await addVillage(w, 'hrac-y', 'Daleká', { x: 2, y: 0 });
    // id vsí: M village-2, Dolní village-3, Hora village-4 (prstenec jde od severu, jména jinak)
    expect([w.m, own, other]).toEqual(['village-2', 'village-3', 'village-4']);
    expect(await around(w, w.h)).toEqual([
      LHOTA,
      { villageId: own, name: 'Dolní', cells: 1, firstStep: 'N' },
      { villageId: other, name: 'Hora', cells: 1, firstStep: 'SW' },
    ]);
  });

  it('svobodní souseda ze souhrnu (kinSingles stavu M v jeho lastDay) – bez načtení stavu', async () => {
    const w = await nearbyWorld();
    // svobodní M (26–30 let) se berou mezi sebou; samotář 60 nevěstu ve vsi nemá (rozdíl nad 15
    // let) – šel by za ženou odjinud
    w.villages.edit(w.m, (s) => {
      s.dwellings.push({ ...dwelling(960), position: { x: 90, z: 90, rotation: 0 } });
      s.people.push(kin({ id: 960, age: 60, sex: 'male', home: 960 }, s.lastDay));
      s.nextId = Math.max(s.nextId, 961);
    });
    const m = w.state(w.m);
    const singles = kinSingles(m, m.lastDay);
    expect(singles).toEqual([{ sex: 'male', ageFrom: 60 }]);
    const finds = w.villages.finds;
    await w.load(w.h, K);
    expect(w.state(w.h).nearby!.villages).toEqual([{ ...LHOTA, singles }]);
    // M se nenačetla celá – jen H (načtení, zápis snímku, nové načtení)
    expect(w.villages.finds - finds).toBe(2);
  });

  it('vymřelá, archivovaná a odříznutá ves v okolí není', async () => {
    const extinct = await marketWorld();
    extinct.state(extinct.m).extinctDay = D - 3;
    expect(await around(extinct, extinct.h)).toEqual([]);

    const archived = await marketWorld();
    archived.settlements.archived.add(archived.villages.records.get(archived.m)!.settlementId);
    expect(await around(archived, archived.h)).toEqual([]);

    const isolated = await marketWorld();
    isolate(isolated, isolated.m);
    expect(await around(isolated, isolated.h)).toEqual([]);
  });

  it('ves na cestě (lidé jdou na novou mapu) v okolí není – po příjezdu je v dalším snímku', async () => {
    const w = await nearbyWorld();
    w.villages.edit(w.m, (s) => {
      s.journey = { direction: 'E', departedDay: D - 5, arrivalDay: K + 40 };
    });
    expect(await around(w, w.h)).toEqual([]);
    await w.load(w.h, K);
    expect(w.state(w.h).nearby).toMatchObject({ day: K, villages: [] });
    // příjezd: `journey` zmizí – další snímek ves zase má
    w.villages.edit(w.m, (s) => {
      delete s.journey;
    });
    await w.load(w.h, K + NEARBY_REFRESH_DAYS);
    expect(w.state(w.h).nearby).toMatchObject({ day: K + NEARBY_REFRESH_DAYS, villages: [LHOTA] });
  });

  it('odříznutá nebo archivovaná ves sama – prázdné okolí', async () => {
    const isolated = await marketWorld();
    isolate(isolated, isolated.h);
    expect(await around(isolated, isolated.h)).toEqual([]);

    const archived = await marketWorld();
    archived.settlements.archived.add(archived.villages.records.get(archived.h)!.settlementId);
    expect(await around(archived, archived.h)).toEqual([]);
  });
});

describe('okolí v pevné dny – zápis před dopočtem (updateVillage, villages.nearby)', () => {
  it('čekající událost je čerstvé okolí – sken se neopakuje', async () => {
    const w = await nearbyWorld();
    const refuse = (): Promise<unknown> =>
      updateVillage(w.villages, w.h, K, landscape, () => ({ ok: false, reason: 'ne' }));
    const stamps = w.villages.stampQueries;
    // odmítnutá akce přes den obnovy: snímek se zapíše, ves se neuloží
    await refuse();
    expect(w.state(w.h).lastDay).toBe(D);
    expect(await eventDays(w, w.h)).toEqual([K]);
    expect(w.villages.stampQueries - stamps).toBe(1);
    // podruhé – snímek čeká ve schránce, nic se nečte ani nezapíše
    await refuse();
    await w.load(w.h, K);
    expect(w.villages.stampQueries - stamps).toBe(1);
    expect(await eventDays(w, w.h)).toEqual([K]);
    expect(w.state(w.h).nearby?.day).toBe(K);
  });

  it('dopočet přes den obnovy: sousedé jen z otisků, jedno načtení vsi navíc po zápisu', async () => {
    const w = await nearbyWorld();
    let finds = w.villages.finds;
    await w.load(w.h, K - 1);
    expect(w.villages.finds - finds).toBe(1);
    finds = w.villages.finds;
    const stamps = w.villages.stampQueries;
    await w.load(w.h, K);
    // načtení, zápis snímku (otisky sousedů), nové načtení se zvýšenou verzí
    expect(w.villages.finds - finds).toBe(2);
    expect(w.villages.stampQueries - stamps).toBe(1);
  });

  it('víc dnů obnovy v jednom dopočtu – snímek na každý, ve stavu poslední', async () => {
    const w = await nearbyWorld();
    await w.load(w.h, K + NEARBY_REFRESH_DAYS);
    expect(await eventDays(w, w.h)).toEqual([K, K + NEARBY_REFRESH_DAYS]);
    expect(w.state(w.h).nearby?.day).toBe(K + NEARBY_REFRESH_DAYS);
  });

  it('odříznutá ves dostane prázdný snímek (a dál se nezkouší), spící nic', async () => {
    const isolated = await nearbyWorld();
    isolate(isolated, isolated.h);
    await isolated.load(isolated.h, K);
    expect(isolated.state(isolated.h).nearby).toEqual({
      day: K,
      self: { villageId: isolated.h, name: 'Vlkov' },
      villages: [],
    });
    // snímek dne obnovy je použitý – další dopočet sken nezkouší (sken začíná sídlem vsi)
    const scan = vi.spyOn(isolated.settlements, 'find');
    await isolated.load(isolated.h, K + 1);
    expect(scan).not.toHaveBeenCalled();
    expect(await eventDays(isolated, isolated.h)).toEqual([K]);

    const asleep = await nearbyWorld();
    asleep.state(asleep.h).extinctDay = D;
    await asleep.load(asleep.h, K + 1);
    expect(await eventDays(asleep, asleep.h)).toEqual([]);
  });

  it('úložiště bez podportu okolí nic nezapíše (testy jádra, kalibrace)', async () => {
    const w = await marketWorld();
    await w.load(w.h, K + 1);
    expect(w.state(w.h).nearby).toBeUndefined();
    expect(await eventDays(w, w.h)).toEqual([]);
  });
});

describe('úklid použitých snímků okolí a zpráv bez nákladu (NEARBY_KEEP_DAYS)', () => {
  it('nový snímek smaže použité snímky starší než mez – novější snímky a jiné události zůstanou', async () => {
    const w = await nearbyWorld();
    const h = w.h;
    // snímky ve dnech obnovy K … K + 390 a jiná událost v den K (ves je dopočítá)
    const old: number[] = [];
    for (let day = K; day <= K + 390; day += NEARBY_REFRESH_DAYS) {
      old.push(day);
      await w.villages.inbox.post({
        villageId: h,
        day,
        ref: `nearby:${h}:${day}`,
        body: {
          kind: 'nearby',
          nearby: { day, self: { villageId: h, name: 'Vlkov' }, villages: [] },
        },
      });
    }
    await w.villages.inbox.post({
      villageId: h,
      day: K,
      ref: 'jina',
      body: { kind: 'raid-day', campaignId: 'c' },
    });
    // použité ohlášení hotové zakázky (zpráva bez nákladu) se maže se snímky, novější zůstane
    for (const day of [K + 5, K + 50]) {
      await w.villages.inbox.post({
        villageId: h,
        day,
        ref: `order:m:${h}:tools:${day}`,
        body: {
          kind: 'order-ready',
          ready: { villageId: 'm', name: 'Lhota', good: 'tools', amount: 5 },
        },
      });
    }
    w.villages.edit(h, (s) => {
      s.lastDay = K + 400;
    });
    const home = w.villages.records.get(h)!;
    const version = home.version;
    const pending = await w.villages.inbox.pending(h, K + 400, K + 430);
    expect(await w.villages.nearby!.post(home, K + 400, K + 430, pending)).toBe(true);
    // pryč jsou snímky se dnem ≤ K + 400 − NEARBY_KEEP_DAYS (K a K + 30)
    expect(NEARBY_KEEP_DAYS).toBe(365);
    expect(await eventDays(w, h)).toEqual([...old.filter((d) => d > K + 35), K + 420]);
    const all = await w.villages.inbox.pending(h, -1, TOTAL_GAME_DAYS);
    expect(all.filter((e) => e.body.kind === 'raid-day').map((e) => e.day)).toEqual([K]);
    expect(all.filter((e) => e.body.kind === 'order-ready').map((e) => e.day)).toEqual([K + 50]);
    // zápis nového snímku zvedl verzi jednou, úklid ji nemění
    expect(w.villages.records.get(h)!.version).toBe(version + 1);
  });

  it('chyba úklidu dopočet nezastaví – zapíše se do logu, nový snímek zůstane', async () => {
    const w = await nearbyWorld();
    const h = w.h;
    w.villages.edit(h, (s) => {
      s.lastDay = K + 400;
    });
    w.villages.inbox.pruneUsed = (): Promise<number> => Promise.reject(new Error('DB spadla'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const home = w.villages.records.get(h)!;
      expect(await w.villages.nearby!.post(home, K + 400, K + 430, [])).toBe(true);
      expect(await eventDays(w, h)).toEqual([K + 420]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('úklid'), expect.any(Error));
    } finally {
      log.mockRestore();
    }
  });

  it('bez nového snímku se nic nemaže', async () => {
    const w = await nearbyWorld();
    const h = w.h;
    await w.villages.inbox.post({
      villageId: h,
      day: K,
      ref: `nearby:${h}:${K}`,
      body: {
        kind: 'nearby',
        nearby: { day: K, self: { villageId: h, name: 'Vlkov' }, villages: [] },
      },
    });
    w.villages.edit(h, (s) => {
      s.lastDay = K + 400;
    });
    const home = w.villages.records.get(h)!;
    expect(await w.villages.nearby!.post(home, K + 400, K + 410, [])).toBe(false);
    expect(await eventDays(w, h)).toEqual([K]);
  });
});

describe('úklid vyřízené pošty výprav po zápisu snímku (markets.md – Rozhodnutí plánu 4, bod 10)', () => {
  /** Den, kdy je H přesně rok za řádky ze dne K. */
  const YEAR = K + MAIL_KEEP_DAYS;

  /** Výsledky dvou výprav H (vydala je M) ve schránce H na dny K a K + 1. */
  async function postResults(w: MarketWorld, coins = 0): Promise<void> {
    for (const day of [K, K + 1]) {
      const key = `market:${w.h}:${day}`;
      await w.villages.inbox.post({
        villageId: w.h,
        day,
        ref: `${key}:out`,
        body: {
          kind: 'market-result',
          result: {
            key,
            sold: {},
            bought: {},
            unsold: coins > 0 ? { coins } : {},
            horses: [],
          },
          from: w.m,
        },
      });
    }
  }

  /** Dny výsledků výprav ve schránce H. */
  async function resultDays(w: MarketWorld): Promise<number[]> {
    const all = await w.villages.inbox.pending(w.h, -1, TOTAL_GAME_DAYS);
    return all.filter((e) => e.body.kind === 'market-result').map((e) => e.day);
  }

  /** H a M v den `day` bez simulace. */
  function jump(w: MarketWorld, day: number): void {
    for (const id of [w.h, w.m]) {
      w.villages.edit(id, (s) => {
        s.lastDay = day;
      });
    }
  }

  it('dopočet přes den obnovy uklidí podle dne vsi před dopočtem (`afterDay` = `lastDay`)', async () => {
    const w = await nearbyWorld();
    const settledMail = vi.spyOn(w.villages.inbox, 'settledMail');
    await w.load(w.h, K);
    expect(settledMail.mock.calls).toEqual([[w.h, D - MAIL_KEEP_DAYS]]);
    // bez dne obnovy se neuklízí
    await w.load(w.h, K + 1);
    expect(settledMail).toHaveBeenCalledTimes(1);
  });

  it('smaže výsledek, který má právě rok, o den mladší zůstane – verzi zvedne jen snímek', async () => {
    const w = await nearbyWorld();
    await postResults(w);
    jump(w, YEAR);
    const home = w.villages.records.get(w.h)!;
    const version = home.version;
    expect(await w.villages.nearby!.post(home, YEAR, YEAR + 30, [])).toBe(true);
    expect(await resultDays(w)).toEqual([K + 1]);
    expect(w.villages.records.get(w.h)!.version).toBe(version + 1);
    // bez nového snímku nic – den obnovy má událost ve schránce, nebo ji mezitím zapsal jiný proces
    jump(w, YEAR + 10);
    const pending = await w.villages.inbox.pending(w.h, YEAR + 10, YEAR + 40);
    for (const known of [pending, []]) {
      expect(await w.villages.nearby!.post(home, YEAR + 10, YEAR + 30, known)).toBe(false);
      expect(await resultDays(w)).toEqual([K + 1]);
    }
  });

  it('chyba úklidu pošty se jen zapíše do logu – snímek i dopočet proběhnou', async () => {
    const w = await nearbyWorld();
    w.villages.inbox.settledMail = (): Promise<never> => Promise.reject(new Error('DB spadla'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await w.load(w.h, K);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('úklid'), expect.any(Error));
    } finally {
      log.mockRestore();
    }
    expect(w.state(w.h).lastDay).toBe(K);
    expect(w.state(w.h).nearby?.day).toBe(K);
  });

  it('schránku zaniklé vsi neuklidí – výsledky s mincemi z ní vrátí úloha světa', async () => {
    const w = await nearbyWorld();
    await postResults(w, 5);
    jump(w, YEAR + 100);
    w.villages.edit(w.h, (s) => {
      s.extinctDay = K - 1;
    });
    const home = w.villages.records.get(w.h)!;
    expect(await w.villages.nearby!.post(home, YEAR + 100, YEAR + 130, [])).toBe(false);
    expect(await resultDays(w)).toEqual([K, K + 1]);
    expect(await w.villages.inbox.strandedResults()).toHaveLength(2);
  });

  it('ves, která zanikne během dopočtu: nepoužitý výsledek úklid nesmaže a mince se vrátí', async () => {
    const w = await nearbyWorld();
    w.villages.edit(w.h, (s) => {
      s.coins = 30;
    });
    jump(w, YEAR);
    // výprava H z doby, kdy ještě žila; výsledek s 17 mincemi leží ve schránce H na příští den
    const home = structuredClone(w.villages.records.get(w.h)!);
    const key = `market:${w.h}:1`;
    w.villages.edit(w.h, (s) => {
      s.trade = {
        nextId: 2,
        expeditions: [
          {
            id: 1,
            kind: 'market',
            direction: 'E',
            trailId: -1,
            startedDay: YEAR - 2,
            give: { coins: 30 },
            get: {},
            porters: 1,
            days: 3,
            cost: 3,
            done: 0,
            market: {
              key,
              villageId: w.m,
              name: 'Lhota',
              wants: {},
              stayDays: 1,
              travelDays: 0,
              arriveDay: YEAR - 1,
              returnDay: YEAR + 1,
            },
          },
        ],
      };
      delete s.coins;
      s.extinctDay = YEAR;
    });
    await w.villages.inbox.post({
      villageId: w.h,
      day: YEAR + 1,
      ref: `${key}:out`,
      body: {
        kind: 'market-result',
        result: { key, sold: {}, bought: {}, unsold: { coins: 17 }, horses: [] },
        from: w.m,
      },
    });
    // druhý proces načetl H ještě živou a zapisuje snímek s úklidem
    expect(await w.villages.nearby!.post(home, YEAR, YEAR + 30, [])).toBe(true);
    expect(await resultDays(w)).toEqual([YEAR + 1]);
    expect(await returnStrandedPeople(w.deps)).toBe(1);
    await w.load(w.m, YEAR + 1);
    expect(w.state(w.m).coins).toBe(17);
  });

  it('souběh webu a workeru přes den obnovy: řádek zmizí jednou, nic nespadne, stav je týž', async () => {
    const one = await nearbyWorld();
    const two = await nearbyWorld();
    for (const w of [one, two]) {
      await postResults(w);
      jump(w, YEAR);
    }
    // dvě načtení po sobě (převody cest běží i po dopočtu) a táž dvě naráz
    for (let i = 0; i < 2; i++) await one.load(one.h, YEAR + 30);
    await Promise.all([two.load(two.h, YEAR + 30), two.load(two.h, YEAR + 30)]);
    expect(await resultDays(two)).toEqual([K + 1]);
    expect(await eventDays(two, two.h)).toEqual(await eventDays(one, one.h));
    expect(two.state(two.h)).toEqual(one.state(one.h));
  });
});
