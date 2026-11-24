import { describe, expect, it, vi } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { NearbyVillage } from '../../domain/village';
import { D, homeVillage } from '../../domain/village/trade/__tests__/market-fixtures';
import { NEARBY_REFRESH_DAYS, nearbyDays, nearbyVillages } from '../nearby';
import { updateVillage } from '../update-village';
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
