import { describe, expect, it } from 'vitest';
import { TOTAL_GAME_DAYS } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import {
  MARKET_BAD_ORDER,
  MARKET_NO_PEOPLE,
  MARKET_OVER_STOCK,
  foundVillage,
  type MarketOrder,
  type VillageState,
} from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import {
  D,
  homeVillage,
  marketVillage,
  report,
} from '../../domain/village/trade/__tests__/market-fixtures';
import type { SeenCell, SeenPart } from '../../domain/war';
import { loadVillage } from '../load-village';
import {
  MARKET_GONE,
  MARKET_UNKNOWN,
  marketOverview,
  sendMarketExpedition,
  type MarketDeps,
} from '../market';
import type { LandscapeSource } from '../settlements';
import { VILLAGE_TRAVELLING } from '../update-village';
import { deliverVillageMail } from '../village-mail';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryKnowledge } from './in-memory-knowledge';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Přehled vsí a odeslání výpravy na trh (markets.md – Pravidla 2, 3 a 8; Rozhodnutí plánu 2, body
// 2 a 7). Hráč `pa` má Vlkov (H, 0,0) a druhou ves Dolní (1,0); cizí Lhota (M, hráč `pb`) je na
// mapě (-1,0), Horní (hráč `pc`) na (3,0) jen ze znalosti rodu a Daleká (hráč `pd`, 7,0) jen ze zprávy.

const NOW = new Date('2027-01-01T00:00:00Z');
const landscape = makeLandscape({ size: 48 });
const landscapes: LandscapeSource = { landscapeOf: () => landscape };
const ORDER: MarketOrder = { give: { grain: 600 }, wants: { cows: 1 }, stayDays: 1 };

/** Ves v nejmenší podobě – má jen žít. */
const plain = (): VillageState => ({
  ...foundVillage({ seed: 5, day: 0, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  lastDay: D,
});

interface World {
  deps: MarketDeps & { knowledge: InMemoryKnowledge };
  villages: InMemoryVillages;
  settlements: InMemorySettlements;
  ids: Record<'h' | 'own' | 'm' | 'far' | 'news', string>;
  settlementOf: Record<string, string>;
}

const place = (
  ownerId: string,
  x: number,
  y = 0,
): Parameters<InMemorySettlements['create']>[0] => ({
  ownerId,
  landscapeSeed: 7 + x,
  layerVersions: CURRENT_LAYER_VERSIONS,
  worldCell: { x, y },
});

async function world(options: { home?: VillageState; isolatedHome?: true } = {}): Promise<World> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const knowledge = new InMemoryKnowledge();
  for (const player of ['pa', 'pb', 'pc', 'pd']) {
    await houses.create({ playerId: player, kind: 'player', createdAt: NOW });
  }
  knowledge.world = { settlements, villages, houses };
  const sH = (await settlements.createSeat(
    options.isolatedHome
      ? { ...place('pa', 0), worldCell: undefined as never, localCell: { x: 0, y: 0 } }
      : place('pa', 0),
  ))!;
  const sOwn = (await settlements.create(
    options.isolatedHome
      ? { ...place('pa', 1), worldCell: undefined as never, localCell: { x: 1, y: 0 } }
      : place('pa', 1),
  ))!;
  const sM = (await settlements.create(place('pb', -1)))!;
  const sFar = (await settlements.create(place('pc', 3)))!;
  const sNews = (await settlements.create(place('pd', 7)))!;
  const ids = {
    h: (await villages.add(sH.id, 'Vlkov', options.home ?? homeVillage())).id,
    own: (await villages.add(sOwn.id, 'Dolní', plain())).id,
    m: (await villages.add(sM.id, 'Lhota', marketVillage())).id,
    far: (await villages.add(sFar.id, 'Horní', plain())).id,
    news: (await villages.add(sNews.id, 'Daleká', plain())).id,
  };
  return {
    deps: { villages, settlements, houses, knowledge, landscapes },
    villages,
    settlements,
    ids,
    settlementOf: {
      [ids.h]: sH.id,
      [ids.own]: sOwn.id,
      [ids.m]: sM.id,
      [ids.far]: sFar.id,
      [ids.news]: sNews.id,
    },
  };
}

/** Rod `pa` viděl na mapě (3,0) tři obydlí, jedno z nich hrnčířskou dílnu. */
async function seeFar(w: World): Promise<void> {
  const dwelling = (id: number, craft?: 'potter'): SeenPart => ({
    key: `dwelling:${id}`,
    pos: { x: id, z: 0 },
    day: D - 20 + id,
    data: {
      kind: 'dwelling',
      id,
      type: 'zemnice',
      position: { x: id, z: 0, rotation: 0 },
      condition: 1,
      ...(craft ? { craft } : {}),
    },
  });
  const seen: SeenCell = {
    villageId: w.ids.far,
    trail: [[1, 0]],
    parts: [dwelling(1), dwelling(2, 'potter'), dwelling(3)],
  };
  const house = (await w.deps.houses.activeOf('pa'))!;
  await w.deps.knowledge.merge(house.id, { x: 3, y: 0 }, seen);
}

async function setState(
  w: World,
  villageId: string,
  change: (s: VillageState) => VillageState,
): Promise<void> {
  const record = (await w.villages.find(villageId))!;
  await w.villages.save(villageId, change(record.state), record.version);
}

const input = (w: World, targetVillageId?: string): Parameters<typeof sendMarketExpedition>[1] => ({
  playerId: 'pa',
  villageId: w.ids.h,
  targetVillageId: targetVillageId ?? w.ids.m,
  order: ORDER,
  today: D,
});

describe('marketOverview', () => {
  it('vlastní ves, cizí soused, ves ze znalosti rodu a ves jen ze zprávy', async () => {
    const w = await world();
    await seeFar(w);
    await setState(w, w.ids.h, (s) => ({
      ...s,
      news: [{ villageId: w.ids.news, name: 'Daleká', report, prices: { grain: 0.9 } }],
    }));
    const overview = (await marketOverview(w.deps, { playerId: 'pa', villageId: w.ids.h }))!;
    expect(overview.map((v) => v.name)).toEqual(['Dolní', 'Lhota', 'Horní', 'Daleká']);
    const by = (name: string) => overview.find((v) => v.name === name)!;
    expect(by('Dolní')).toMatchObject({ own: true, cells: 1, travelDays: 0, blocked: null });
    expect(by('Lhota')).toMatchObject({ own: false, cells: 1, travelDays: 0, seen: null });
    expect(by('Horní')).toMatchObject({ cells: 3, travelDays: 2, blocked: null });
    expect(by('Horní').seen).toEqual({ day: D - 17, houses: 3, crafts: ['potter'] });
    expect(by('Daleká')).toMatchObject({ cells: 7, travelDays: 6, seen: null });
    expect(by('Daleká').news).toMatchObject({ report, prices: { grain: 0.9 } });
    // domovská ves v přehledu není
    expect(overview.some((v) => v.villageId === w.ids.h)).toBe(false);
  });

  it('bez znalosti rodu a bez zprávy cizí vzdálená ves v přehledu není', async () => {
    const w = await world();
    const overview = (await marketOverview(w.deps, { playerId: 'pa', villageId: w.ids.h }))!;
    expect(overview.map((v) => v.name)).toEqual(['Dolní', 'Lhota']);
  });

  it('vymřelá ves je zablokovaná s důvodem', async () => {
    const w = await world();
    await setState(w, w.ids.m, (s) => ({ ...s, extinctDay: D - 3 }));
    const overview = (await marketOverview(w.deps, { playerId: 'pa', villageId: w.ids.h }))!;
    expect(overview.find((v) => v.name === 'Lhota')?.blocked).toBe(MARKET_GONE);
  });

  it('archivovaná ves v přehledu není', async () => {
    const w = await world();
    w.settlements.archived.add(w.settlementOf[w.ids.m]!);
    const overview = (await marketOverview(w.deps, { playerId: 'pa', villageId: w.ids.h }))!;
    expect(overview.map((v) => v.name)).toEqual(['Dolní']);
  });

  it('odříznutý rod vidí jen své vsi', async () => {
    const w = await world({ isolatedHome: true });
    await setState(w, w.ids.h, (s) => ({
      ...s,
      news: [{ villageId: w.ids.m, name: 'Lhota', report }],
    }));
    const overview = (await marketOverview(w.deps, { playerId: 'pa', villageId: w.ids.h }))!;
    expect(overview.map((v) => v.name)).toEqual(['Dolní']);
  });

  it('správce cizí vsi nevidí ostatní vsi držitele ani jeho znalost mapy, sousedy a zprávy ano', async () => {
    const w = await world();
    await seeFar(w);
    await setState(w, w.ids.h, (s) => ({
      ...s,
      news: [{ villageId: w.ids.news, name: 'Daleká', report, prices: { grain: 0.9 } }],
    }));
    const overview = (await marketOverview(w.deps, {
      playerId: 'pa',
      actorId: 'ps',
      villageId: w.ids.h,
    }))!;
    // Dolní (druhá ves držitele) a Horní (jen ze znalosti rodu) mizí; Lhota (soused) a Daleká (zpráva) zůstávají
    expect(overview.map((v) => v.name)).toEqual(['Lhota', 'Daleká']);
  });

  it('zpráva o druhé vsi držitele: držitel ji v přehledu vidí, správce ne', async () => {
    const w = await world();
    await setState(w, w.ids.h, (s) => ({
      ...s,
      news: [{ villageId: w.ids.own, name: 'Dolní', report }],
    }));
    const input = { playerId: 'pa', villageId: w.ids.h };
    const holder = (await marketOverview(w.deps, input))!;
    expect(holder.find((v) => v.name === 'Dolní')?.news).toMatchObject({ report });
    const steward = (await marketOverview(w.deps, { ...input, actorId: 'ps' }))!;
    expect(steward.map((v) => v.name)).toEqual(['Lhota']);
  });

  it('zpráva o sousední vsi: obchodníci z jiných vsí držitele jsou správci bez jména, držiteli se jménem', async () => {
    const w = await world();
    const traders = [
      { name: 'Dolní', villageId: w.ids.own, day: D - 1, goods: [] },
      { name: 'Cizí', villageId: w.ids.far, day: D - 2, goods: [] },
      { name: 'Starý', day: D - 3, goods: [] },
      { name: 'Domů', villageId: w.ids.h, day: D - 4, goods: [] },
    ];
    await setState(w, w.ids.h, (s) => ({
      ...s,
      news: [{ villageId: w.ids.m, name: 'Lhota', report: { ...report, traders } }],
    }));
    const input = { playerId: 'pa', villageId: w.ids.h };
    const names = (list: Awaited<ReturnType<typeof marketOverview>>): string[] =>
      list!.find((v) => v.name === 'Lhota')!.news!.report.traders.map((t) => t.name);
    expect(names(await marketOverview(w.deps, input))).toEqual(['Dolní', 'Cizí', 'Starý', 'Domů']);
    // správce: jen ves, kterou zná (domovská ves správcovské vsi), jinak bez jména
    expect(names(await marketOverview(w.deps, { ...input, actorId: 'ps' }))).toEqual([
      '',
      '',
      '',
      'Domů',
    ]);
  });

  it('ves, která není hráče, vrátí null', async () => {
    const w = await world();
    expect(await marketOverview(w.deps, { playerId: 'pb', villageId: w.ids.h })).toBeNull();
    expect(await marketOverview(w.deps, { playerId: 'pa', villageId: 'neni' })).toBeNull();
  });
});

describe('sendMarketExpedition', () => {
  it('neznámý cíl vrátí MARKET_UNKNOWN a nic se neuloží', async () => {
    const w = await world();
    const version = (await w.villages.find(w.ids.h))!.version;
    for (const target of [w.ids.far, 'neni']) {
      expect(await sendMarketExpedition(w.deps, input(w, target))).toEqual({
        ok: false,
        reason: MARKET_UNKNOWN,
      });
    }
    expect((await w.villages.find(w.ids.h))!.version).toBe(version);
  });

  it('nedostatek zboží vrátí důvod z jádra a nic se neuloží', async () => {
    const w = await world();
    const version = (await w.villages.find(w.ids.h))!.version;
    const result = await sendMarketExpedition(w.deps, {
      ...input(w),
      order: { give: { grain: 1e9 }, wants: {}, stayDays: 1 },
    });
    expect(result).toEqual({ ok: false, reason: 'Tolik ves nemá.' });
    expect((await w.villages.find(w.ids.h))!.version).toBe(version);
  });

  it('vlastní domovská ves, zaniklá, na cestě, archivovaná a odříznutá se odmítnou', async () => {
    const w = await world();
    expect(await sendMarketExpedition(w.deps, input(w, w.ids.h))).toEqual({
      ok: false,
      reason: MARKET_UNKNOWN,
    });
    await setState(w, w.ids.own, (s) => ({ ...s, extinctDay: D - 1 }));
    expect(await sendMarketExpedition(w.deps, input(w, w.ids.own))).toEqual({
      ok: false,
      reason: MARKET_GONE,
    });
    await setState(w, w.ids.m, (s) => ({ ...s, abandonedDay: D - 1 }));
    expect(await sendMarketExpedition(w.deps, input(w, w.ids.m))).toEqual({
      ok: false,
      reason: MARKET_GONE,
    });
    await setState(w, w.ids.m, (s) => {
      const next: VillageState = { ...s, journey: {} as never };
      delete next.abandonedDay;
      return next;
    });
    expect(await sendMarketExpedition(w.deps, input(w, w.ids.m))).toEqual({
      ok: false,
      reason: VILLAGE_TRAVELLING,
    });
    w.settlements.archived.add(w.settlementOf[w.ids.m]!);
    expect(await sendMarketExpedition(w.deps, input(w, w.ids.m))).toEqual({
      ok: false,
      reason: MARKET_UNKNOWN,
    });
    // nic z toho výpravu nezaložilo
    expect((await w.villages.find(w.ids.h))!.state.trade?.expeditions ?? []).toEqual([]);
    const iso = await world({ isolatedHome: true });
    await setState(iso, iso.ids.h, (s) => ({
      ...s,
      news: [{ villageId: iso.ids.m, name: 'Lhota', report }],
    }));
    expect(await sendMarketExpedition(iso.deps, input(iso))).toEqual({
      ok: false,
      reason: MARKET_UNKNOWN,
    });
  });

  it('správce nesmí zvolit ostatní vsi držitele ani vsi z jeho znalosti mapy', async () => {
    const w = await world();
    await seeFar(w);
    const version = (await w.villages.find(w.ids.h))!.version;
    for (const target of [w.ids.own, w.ids.far]) {
      expect(await sendMarketExpedition(w.deps, { ...input(w, target), actorId: 'ps' })).toEqual({
        ok: false,
        reason: MARKET_UNKNOWN,
      });
    }
    expect((await w.villages.find(w.ids.h))!.version).toBe(version);
    // soused projde i za správce
    const ok = await sendMarketExpedition(w.deps, { ...input(w), actorId: 'ps' });
    expect(ok.ok).toBe(true);
  });

  it('pobyt musí být celý a kladný', async () => {
    const w = await world();
    for (const stayDays of [0, -1, 1.5, Number.NaN, Infinity]) {
      const result = await sendMarketExpedition(w.deps, {
        ...input(w),
        order: { ...ORDER, stayDays },
      });
      expect(result.ok).toBe(false);
    }
    expect((await w.villages.find(w.ids.h))!.state.trade?.expeditions ?? []).toEqual([]);
  });

  it('úspěch: výprava na trh a příjezd ve schránce hostitele den po odeslání', async () => {
    const w = await world();
    const result = await sendMarketExpedition(w.deps, input(w));
    expect(result).toEqual({ ok: true, arriveDay: D + 1, returnDay: D + 2 });
    const home = (await w.villages.find(w.ids.h))!.state;
    const trip = home.trade!.expeditions.find((e) => e.kind === 'market');
    expect(trip?.market?.villageId).toBe(w.ids.m);
    expect(trip?.destination?.firstStep).toBe('W');
    const pending = await w.villages.inbox.pending(w.ids.m, D - 6, TOTAL_GAME_DAYS);
    expect(
      pending.map((e) => [e.body.kind === 'market-arrive' ? e.body.arrival.key : '', e.day]),
    ).toEqual([[`market:${w.ids.h}:${trip!.id}`, D + 1]]);
    expect(home.outbox).toBeUndefined();
  });

  it('ves pozadu se napřed dopočte a příjezd padne na den po odeslání', async () => {
    const w = await world({ home: { ...homeVillage(), lastDay: D - 5 } });
    const result = await sendMarketExpedition(w.deps, input(w));
    expect(result).toEqual({ ok: true, arriveDay: D + 1, returnDay: D + 2 });
    const home = (await w.villages.find(w.ids.h))!.state;
    expect(home.lastDay).toBe(D);
    const trip = home.trade!.expeditions.find((e) => e.kind === 'market');
    expect(trip?.startedDay).toBe(D + 1);
    const pending = await w.villages.inbox.pending(w.ids.m, D - 6, TOTAL_GAME_DAYS);
    expect(pending.map((e) => e.day)).toEqual([D + 1]);
  });

  // Výprava hráče s mincemi (markets.md – Rozhodnutí plánu 4, body 1 a 4; Martin 25. 11. 2026: „Mince
  // utrácí jen vojvoda/správce“)
  const coinsHome = (): VillageState => ({ ...homeVillage(), coins: 400 });
  const send = (
    w: World,
    order: MarketOrder,
    fields: { actorId?: string; targetVillageId?: string } = {},
  ): ReturnType<typeof sendMarketExpedition> =>
    sendMarketExpedition(w.deps, { ...input(w), order, ...fields });
  const coinOrder: MarketOrder = { give: { coins: 400 }, wants: { grain: 200 }, stayDays: 1 };

  it('mince na seznamu i víc mincí, než ves má, se odmítnou a nic se neuloží', async () => {
    const w = await world({ home: coinsHome() });
    const version = (await w.villages.find(w.ids.h))!.version;
    expect(await send(w, { ...coinOrder, wants: { grain: 200, coins: 1 } })).toEqual({
      ok: false,
      reason: MARKET_BAD_ORDER,
    });
    expect(await send(w, { ...coinOrder, give: { coins: 401 } })).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
    // co lidé domů neunesou, se za mince koupit nedá (8 dospělých a čtyřkolák)
    expect(await send(w, { ...coinOrder, wants: { pottery: 2_000 } })).toEqual({
      ok: false,
      reason: MARKET_NO_PEOPLE,
    });
    const home = (await w.villages.find(w.ids.h))!;
    expect(home.version).toBe(version);
    expect(home.state.coins).toBe(400);
    expect(await w.villages.inbox.pending(w.ids.m, D - 6, TOTAL_GAME_DAYS)).toEqual([]);
  });

  it('výprava se 400 mincemi: 200 kg obilí za 14 mincí, 386 se vrátí domů', async () => {
    const w = await world({ home: coinsHome() });
    await setState(w, w.ids.m, () => {
      const host = marketVillage(0);
      return { ...host, storesKg: host.storesKg + 1_000 };
    });
    expect(await send(w, coinOrder)).toEqual({ ok: true, arriveDay: D + 1, returnDay: D + 2 });
    const left = (await w.villages.find(w.ids.h))!.state;
    expect(left).not.toHaveProperty('coins');
    const [arrive] = await w.villages.inbox.pending(w.ids.m, D - 6, TOTAL_GAME_DAYS);
    expect(arrive!.body).toMatchObject({
      kind: 'market-arrive',
      arrival: { goods: { coins: 400 }, wants: { grain: 200 } },
    });

    // trh u hostitele a pošta domů – stejné use-casy volá web i worker
    const load = async (villageId: string, today: number): Promise<VillageState> => {
      await loadVillage(w.deps, { villageId, today, landscape });
      await deliverVillageMail(w.deps, villageId);
      return (await w.villages.find(villageId))!.state;
    };
    const host = await load(w.ids.m, D + 1);
    expect(host.coins).toBe(14);
    expect(host.chronicle.find((e) => e.kind === 'market-held')).toMatchObject({
      sold: { grain: 200 },
      bought: { coins: 14 },
    });
    const back = await load(w.ids.h, D + 2);
    expect(back.coins).toBe(386);
    expect(back.chronicle.find((e) => e.kind === 'market-returned')).toMatchObject({
      bought: { grain: 200 },
      sold: {},
    });
    expect(back.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
    // přibylo 200 kg proti téže vsi, které výprava nic nepřivezla (sýpka z nich den ztratila zlomek)
    const other = await world({ home: structuredClone(left) });
    await loadVillage(other.deps, { villageId: other.ids.h, today: D + 2, landscape });
    const without = (await other.villages.find(other.ids.h))!.state;
    expect(back.storesKg - without.storesKg).toBeCloseTo(200, 0);
  });

  it('správce cizí vsi utratí její mince u souseda, do vsí držitele je nepošle', async () => {
    const w = await world({ home: coinsHome() });
    await seeFar(w);
    for (const target of [w.ids.own, w.ids.far]) {
      expect(await send(w, coinOrder, { actorId: 'ps', targetVillageId: target })).toEqual({
        ok: false,
        reason: MARKET_UNKNOWN,
      });
    }
    expect((await w.villages.find(w.ids.h))!.state.coins).toBe(400);
    expect(await send(w, coinOrder, { actorId: 'ps' })).toMatchObject({ ok: true });
    expect((await w.villages.find(w.ids.h))!.state).not.toHaveProperty('coins');
  });
});
