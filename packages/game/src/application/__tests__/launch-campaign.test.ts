import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORLD } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS, SURFACE_CODES, type Landscape } from '../../domain/landscape';
import { horseVillage, START } from '../../domain/village/__tests__/horse-fixtures';
import { foodNeedPerDay } from '../../domain/village/people/people';
import { villageGate } from '../../domain/village/people/departure';
import { craftCoverage } from '../../domain/village/crafts/crafts';
import type { Person, Road, VillageState } from '../../domain/village/types';
import type { CampaignMap } from '../../domain/war/campaign-types';
import { armyStrength, lineManStrength, musterOf, villagerStrength } from '../../domain/war';
import { launchCampaign, type LaunchDeps } from '../launch-campaign';
import {
  CAMPAIGN_REASONS,
  kinInTarget,
  musterSeed,
  planCampaign,
  villagePlace,
  villageStandingPlace,
  type CampaignPlan,
} from '../plan-campaign';
import { NEWCOMER_REASONS } from '../newcomers';
import { NOT_PLAYER_VILLAGE } from '../player-villages';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryDisputes } from './in-memory-disputes';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryWars } from './in-memory-wars';

// Příprava a vyslání tažení (war.md – Velení a příprava tažení; plán 2026-11-03 – Úloha 6.6).

const DAY_MS = 86_400_000;
const NOW = new Date(OFFICIAL_WORLD.startMs + 400 * DAY_MS);
const STUB_LANDSCAPE = { size: 128, cellSizeM: 15, villageSite: { x: 64, y: 64 } } as Landscape;

/**
 * Mapa tažení 128 × 15 m: louka, nebo (`enclosed`) paseka 720 m uprostřed obklopená hustým lesem
 * až ke kraji – ves v ní je odříznutá (war.md – Pohyb, Odříznutá ves).
 */
function campaignLandscape(enclosed: boolean): Landscape {
  const size = 128;
  const surface = new Uint8Array(size * size).fill(SURFACE_CODES.meadow);
  if (enclosed) {
    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const inside = tx >= 40 && tx < 88 && ty >= 40 && ty < 88;
        if (!inside) surface[ty * size + tx] = SURFACE_CODES.forest;
      }
    }
  }
  return {
    size,
    cellSizeM: 15,
    heights: new Float32Array(size * size),
    surface,
    fertility: new Uint8Array(size * size),
    villageSite: { x: 64, y: 64 },
    stream: [],
    obstacleLayer: null,
  };
}
const MEADOW_LANDSCAPE = campaignLandscape(false);
const ENCLOSED_LANDSCAPE = campaignLandscape(true);

/** Pevná cesta od kraje ke kraji přes branku dvorce (sever – jih) – průsek hustým lesem. */
function withTrail(state: VillageState): void {
  const gate = villageGate(state, STUB_LANDSCAPE);
  const road: Road = {
    id: 900,
    points: [
      { x: gate.x, z: -958 },
      { x: gate.x, z: gate.z },
      { x: gate.x, z: 958 },
    ],
    bornDay: 0,
    grade: 'improved',
    traffic: [],
    spots: [],
  };
  state.roads = {
    nextId: 901,
    roads: [...(state.roads?.roads ?? []), road],
    trees: state.roads?.trees ?? [],
    labor: state.roads?.labor ?? { from: 0, days: 0, shares: [] },
  };
}

/** Ves s vojvodou (muž rodu 40 let, jméno Bořivoj), synem rodu 17 let a deseti vesničany. */
function ownVillage(name: string, foundedDay = START - 4000): VillageState {
  const s = horseVillage(null, 1, 12);
  s.foundedDay = foundedDay;
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  s.people.find((p) => p.id === 10)!.name = name;
  return s;
}

async function world(
  options: {
    targetProtectedHouse?: boolean;
    targetNewVillage?: boolean;
    /** Druhá ves (Dub) v pasece obklopené hustým lesem – bez cesty, nebo s průsekem (`withTrail`). */
    secondCut?: 'enclosed' | 'trail';
  } = {},
): Promise<{
  deps: LaunchDeps;
  villages: InMemoryVillages;
  campaigns: InMemoryCampaigns;
  wars: InMemoryWars;
  houses: InMemoryHouses;
  disputes: InMemoryDisputes;
  vassalages: InMemoryVassalages;
  ids: { home: string; second: string; target: string; foreign: string };
  plan: CampaignPlan;
  forcedHome: number[];
  forcedSecond: number[];
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  const wars = new InMemoryWars();
  const old = new Date(NOW.getTime() - 30 * DAY_MS);
  const a = await houses.create({ playerId: 'pa', kind: 'player', createdAt: old });
  const b = await houses.create({
    playerId: 'pb',
    kind: 'player',
    createdAt: options.targetProtectedHouse ? NOW : old,
  });
  await houses.create({ playerId: 'pc', kind: 'player', createdAt: old });
  const versions = CURRENT_LAYER_VERSIONS;
  const sa = await settlements.seatAtOrigin({
    ownerId: 'pa',
    landscapeSeed: 1,
    layerVersions: versions,
  });
  const sa2 = (await settlements.create({
    ownerId: 'pa',
    landscapeSeed: 2,
    layerVersions: versions,
    worldCell: { x: 0, y: 1 },
  }))!;
  const sb = (await settlements.create({
    ownerId: 'pb',
    landscapeSeed: 3,
    layerVersions: versions,
    worldCell: { x: 1, y: 0 },
  }))!;
  const sc = (await settlements.create({
    ownerId: 'pc',
    landscapeSeed: 4,
    layerVersions: versions,
    worldCell: { x: 5, y: 5 },
  }))!;
  const home = await villages.add(sa.id, 'Lhota', ownVillage('Bořivoj'));
  const secondState = ownVillage('Radim');
  if (options.secondCut === 'trail') withTrail(secondState);
  const second = await villages.add(sa2.id, 'Dub', secondState);
  const target = await villages.add(
    sb.id,
    'Kněžice',
    ownVillage('Ctibor', options.targetNewVillage ? START - 100 : START - 4000),
  );
  const foreign = await villages.add(sc.id, 'Vrba', ownVillage('Dalibor'));
  const onCell: Record<string, string> = {
    '0,0': home.id,
    '0,1': second.id,
    '1,0': target.id,
    '5,5': foreign.id,
  };
  const mapOf = (cell: { x: number; y: number }): CampaignMap => {
    const id = onCell[`${cell.x},${cell.y}`];
    const enclosed = options.secondCut !== undefined && cell.x === 0 && cell.y === 1;
    return {
      landscape: enclosed ? ENCLOSED_LANDSCAPE : MEADOW_LANDSCAPE,
      obstacles: null,
      villageIds: id ? [id] : [],
    };
  };
  await houses.setLord(a.id, { villageId: home.id, personId: 10 });
  await houses.setLord(b.id, { villageId: target.id, personId: 10 });
  let n = 0;
  const campaigns = new InMemoryCampaigns();
  const disputes = new InMemoryDisputes();
  const vassalages = new InMemoryVassalages();
  const deps: LaunchDeps = {
    houses,
    wars,
    notices: new InMemoryNotices(),
    villages,
    settlements,
    landscapes: { landscapeOf: () => STUB_LANDSCAPE },
    world: OFFICIAL_WORLD,
    cells: { mapOf: async (cell) => mapOf(cell) },
    campaigns,
    seeds: { nextSeed: () => 99 },
    newId: () => `camp-${++n}`,
    disputes,
    vassalages,
  };
  // nucení: první způsobilí, kteří se nepřihlásili sami (dobrovolníky losuje vlastní los)
  const forcedOf = (
    record: { state: VillageState },
    from: { x: number; y: number },
    n: number,
  ): number[] =>
    musterOf(
      record.state,
      record.state.lastDay,
      kinInTarget(record.state, from, { x: 1, y: 0 }),
      musterSeed(record.state, target.id),
    ).others.slice(0, n);
  const forcedHome = forcedOf(home, { x: 0, y: 0 }, 3);
  const forcedSecond = forcedOf(second, { x: 0, y: 1 }, 1);
  const plan: CampaignPlan = {
    commander: { villageId: home.id, personId: 10 },
    deputy: { villageId: home.id, personId: 12 },
    villages: [
      { villageId: home.id, lineMen: [10, 12], villagers: [], forced: forcedHome },
      { villageId: second.id, lineMen: [12], villagers: [], forced: forcedSecond },
    ],
    assemblyVillageId: home.id,
    targetVillageId: target.id,
    groups: 'by-village',
    surrendered: 'lead',
    food: 100,
  };
  return {
    deps,
    villages,
    campaigns,
    wars,
    houses,
    disputes,
    vassalages,
    ids: { home: home.id, second: second.id, target: target.id, foreign: foreign.id },
    plan,
    forcedHome,
    forcedSecond,
  };
}

const input = (
  plan: CampaignPlan,
): { playerId: string; plan: CampaignPlan; today: number; now: Date } => ({
  playerId: 'pa',
  plan,
  today: START,
  now: NOW,
});

/** Spojí obě strany války, ať útok není přepadení. */
async function declareWarBetween(w: Awaited<ReturnType<typeof world>>): Promise<void> {
  const [a, b] = [await w.houses.activeOf('pa'), await w.houses.activeOf('pb')];
  await w.wars.start({
    houses: [a!.id, b!.id],
    startedAt: NOW,
    startedDay: START,
    how: 'declared',
  });
}

describe('plán tažení (planCampaign)', () => {
  it('odhad síly odpovídá armyStrength, cesta a zásoby jsou spočtené', async () => {
    const w = await world();
    await declareWarBetween(w);
    const estimate = await planCampaign(w.deps, input(w.plan));
    if (typeof estimate === 'string') throw new Error(estimate);
    const home = (await w.villages.find(w.ids.home))!.state;
    const second = (await w.villages.find(w.ids.second))!.state;
    const line = (state: VillageState, id: number): number =>
      lineManStrength(
        state.people.find((p) => p.id === id)!,
        null,
      );
    const forced = villagerStrength(true, 50);
    const expected =
      armyStrength(
        [line(home, 10), line(home, 12), forced, forced, forced],
        craftCoverage(home, home.lastDay).tools,
      ) + armyStrength([line(second, 12), forced], craftCoverage(second, second.lastDay).tools);
    expect(estimate.men).toEqual({ line: 3, volunteers: 0, forced: 4, total: 7 });
    expect(estimate.strength).toBeCloseTo(expected);
    expect(estimate.ambush).toBe(false);
    expect(estimate.liveCommand).toBe(true);
    expect(estimate.travelDays).toBeGreaterThan(1);
    expect(estimate.foodDays).toBeCloseTo(100 / 7);
    expect(estimate.supplies.carryKg).toBe(7 * 25);
  });

  it('jen vlastní vsi rodu – ves spravovaná cizí hráčem do tažení nepatří', async () => {
    const w = await world();
    w.plan.villages.push({ villageId: w.ids.foreign, lineMen: [10], villagers: [], forced: [] });
    expect(await planCampaign(w.deps, input(w.plan))).toBe(NOT_PLAYER_VILLAGE);
  });

  it('velitel musí být muž rodu od 16 let ze zvolených vsí', async () => {
    const w = await world();
    expect(
      await planCampaign(
        w.deps,
        input({ ...w.plan, commander: { villageId: w.ids.home, personId: 20 } }),
      ),
    ).toBe(CAMPAIGN_REASONS.noCommander);
    // chlapec rodu (11 let) není způsobilý
    const home = (await w.villages.find(w.ids.home))!.state;
    const boy: Person = {
      id: 14,
      bornDay: home.people.find((p) => p.id === 14)!.bornDay,
      dwellingId: 1,
      sex: 'male',
      line: true,
    };
    w.villages.edit(w.ids.home, (s) => {
      s.people.find((p) => p.id === 14)!.line = true;
    });
    expect(boy.line).toBe(true);
    const withBoy = {
      ...w.plan,
      commander: { villageId: w.ids.home, personId: 14 },
      villages: [{ villageId: w.ids.home, lineMen: [14], villagers: [], forced: [] }],
    };
    expect(typeof (await planCampaign(w.deps, input(withBoy)))).toBe('string');
  });

  it('cíl v ochraně nováčka nebo s novou vsí se odmítne, bez války i s ní', async () => {
    const w = await world({ targetProtectedHouse: true });
    expect(await planCampaign(w.deps, input(w.plan))).toMatch(/Ctibor je pod ochranou ještě 7 dní/);
    const v = await world({ targetNewVillage: true });
    await declareWarBetween(v);
    expect(await planCampaign(v.deps, input(v.plan))).toMatch(/novou ves pod ochranou/);
  });

  it('jídlo víc než v shromaždišti nebo než unese vojsko se odmítne', async () => {
    const w = await world();
    expect(await planCampaign(w.deps, input({ ...w.plan, food: 1e9 }))).toBe(
      CAMPAIGN_REASONS.noFood,
    );
    w.villages.edit(w.ids.home, (s) => {
      s.storesKg = 1e9;
    });
    expect(await planCampaign(w.deps, input({ ...w.plan, food: 1e6 }))).toBe(
      CAMPAIGN_REASONS.tooHeavy,
    );
  });

  it('odříznutý rod (newcomers.md) nenapadne nikdo ani on nikoho – ani po týdnu ochrany', async () => {
    const w = await world();
    const [a, b] = [await w.houses.activeOf('pa'), await w.houses.activeOf('pb')];
    b!.placedAt = null;
    expect(await planCampaign(w.deps, input(w.plan))).toBe(NEWCOMER_REASONS.isolatedTarget);
    expect(await launchCampaign(w.deps, input(w.plan))).toEqual({
      ok: false,
      reason: NEWCOMER_REASONS.isolatedTarget,
    });
    // i ve válce (válka s odříznutým nevznikne, ale tažení ji nesmí obejít)
    await declareWarBetween(w);
    expect(await planCampaign(w.deps, input(w.plan))).toBe(NEWCOMER_REASONS.isolatedTarget);
    b!.placedAt = b!.createdAt;
    a!.placedAt = null;
    expect(await planCampaign(w.deps, input(w.plan))).toBe(NEWCOMER_REASONS.notPlaced);
    expect(w.campaigns.rows.size).toBe(0);
  });

  it('odříznutá ves do tažení nejde (Martin 17. 11. 2026 – „Nesmí do tažení“), se stezkou ano', async () => {
    const cut = await world({ secondCut: 'enclosed' });
    expect(await planCampaign(cut.deps, input(cut.plan))).toBe(CAMPAIGN_REASONS.noRoute);
    // bez odříznuté vsi v plánu – jen shromaždiště – plán projde
    const alone = { ...cut.plan, villages: cut.plan.villages.slice(0, 1) };
    expect(typeof (await planCampaign(cut.deps, input(alone)))).toBe('object');
    const open = await world({ secondCut: 'trail' });
    expect(typeof (await planCampaign(open.deps, input(open.plan)))).toBe('object');
  });

  it('vlastní ves jako cíl nejde', async () => {
    const w = await world();
    expect(await planCampaign(w.deps, input({ ...w.plan, targetVillageId: w.ids.second }))).toBe(
      CAMPAIGN_REASONS.sameHouse,
    );
  });
});

describe('vyslání tažení (launchCampaign)', () => {
  it('muži odejdou (away: campaign), doma nejedí, jídlo se odečte a tažení vznikne se záměrem', async () => {
    const w = await world();
    await declareWarBetween(w);
    const stores = (await w.villages.find(w.ids.home))!.state.storesKg;
    const result = await launchCampaign(w.deps, input(w.plan));
    expect(result.ok).toBe(true);
    const home = (await w.villages.find(w.ids.home))!.state;
    for (const id of [10, 12, ...w.forcedHome]) {
      const p = home.people.find((q) => q.id === id)!;
      expect(p.away).toMatchObject({ kind: 'campaign', refId: 'camp-1' });
      expect(foodNeedPerDay(p, home.lastDay)).toBe(0);
    }
    const stayed = home.people.filter(
      (q) => q.id >= 20 && q.sex === 'male' && !w.forcedHome.includes(q.id),
    );
    expect(stayed.length).toBeGreaterThan(0);
    expect(stayed.every((q) => q.away === undefined)).toBe(true);
    expect(home.storesKg).toBe(stores - 100);
    const second = (await w.villages.find(w.ids.second))!.state;
    expect(second.storesKg).toBe(stores);
    expect(second.people.find((q) => q.id === w.forcedSecond[0])!.away?.kind).toBe('campaign');
    expect(w.campaigns.rows.size).toBe(1);
    const state = JSON.parse(w.campaigns.rows.get('camp-1')!.state) as {
      members: { ref: { villageId: string } }[];
      supplies: { foodKg: number };
      surrendered: string;
      liveCommand: boolean;
      homes: Record<string, { cell: { x: number; y: number } }>;
    };
    expect(state.members).toHaveLength(7);
    // domovské vsi mužů – kam jdou hloučky po rozpadu (Ú6.12)
    const villages = [...new Set(state.members.map((m) => m.ref.villageId))].sort();
    expect(Object.keys(state.homes).sort()).toEqual(villages);
    expect(state.supplies.foodKg).toBe(100);
    expect(state.surrendered).toBe('lead');
    expect(state.liveCommand).toBe(true);
    expect(w.campaigns.intents).toHaveLength(1);
    expect(w.campaigns.intents[0]!.body).toEqual({ kind: 'set-out' });
  });

  it('shromaždiště, cíl i domovy leží u dvorce vsí, ne ve středu místa pro ves (war.md – Plán tažení)', async () => {
    const w = await world();
    await declareWarBetween(w);
    expect((await launchCampaign(w.deps, input(w.plan))).ok).toBe(true);
    const state = JSON.parse(w.campaigns.rows.get('camp-1')!.state) as {
      assembly: { pos: { x: number; z: number } };
      target: { pos: { x: number; z: number } };
      homes: Record<string, { pos: { x: number; z: number } }>;
    };
    // dvorec fixtury stojí v (0, 0), střed místa pro ves v (7,5; 7,5); místem vsi je branka
    // dvorce – odtud vyráží i výprava (`villageGate`, oprava Úlohy 5 plánu 2026-11-16-dense-forest)
    expect(villagePlace({ x: 0, y: 0 }, STUB_LANDSCAPE).pos).toEqual({ x: 7.5, z: 7.5 });
    const home = (await w.villages.find(w.ids.home))!.state;
    const gate = villageGate(home, STUB_LANDSCAPE);
    expect(gate).not.toEqual({ x: 0, z: 0 });
    expect(Math.hypot(gate.x, gate.z)).toBeLessThan(30);
    expect(state.assembly.pos).toEqual(gate);
    expect(state.target.pos).toEqual(gate);
    for (const pos of Object.values(state.homes)) expect(pos.pos).toEqual(gate);
  });

  it('poloha vsi: branka dvorce, bez obydlí střed místa pro ves', () => {
    const cell = { x: 0, y: 0 };
    const state = ownVillage('Bořivoj');
    const gate = villageGate(state, STUB_LANDSCAPE);
    expect(villageStandingPlace(cell, STUB_LANDSCAPE, state).pos).toEqual(gate);
    // dvorec o kus dál než druhé obydlí – míří se k brance dvorce, ne k průměru obou
    const moved = { ...state, dwellings: state.dwellings.slice() };
    moved.dwellings[0] = { ...moved.dwellings[0]!, position: { x: 10, z: 4, rotation: 0 } };
    moved.manorId = moved.dwellings[0]!.id;
    const there = villageStandingPlace(cell, STUB_LANDSCAPE, moved).pos;
    expect(there).toEqual(villageGate(moved, STUB_LANDSCAPE));
    expect(Math.hypot(there.x - gate.x - 10, there.z - gate.z - 4)).toBeLessThan(1);
    const empty = { ...state, dwellings: [], constructions: [], manorId: undefined };
    expect(villageStandingPlace(cell, STUB_LANDSCAPE, empty).pos).toEqual({ x: 7.5, z: 7.5 });
  });

  it('útok na rod, se kterým není válka, je přepadení a válka začne', async () => {
    const w = await world();
    expect(w.wars.all).toHaveLength(0);
    const result = await launchCampaign(w.deps, input(w.plan));
    expect(result.ok).toBe(true);
    expect(w.wars.all[0]).toMatchObject({ how: 'ambush', status: 'active' });
  });

  it('přepadení tažením přes rozsudek „mír“ zapíše útočníkovi neposlušnost', async () => {
    const w = await world();
    const [a, b, c] = [
      await w.houses.activeOf('pa'),
      await w.houses.activeOf('pb'),
      await w.houses.activeOf('pc'),
    ];
    // c je pán a i b a nařídil mezi nimi mír
    const since = { sinceAt: NOW, sinceDay: START, origin: 'negotiation' as const };
    const va = await w.vassalages.create({
      lordHouseId: c!.id,
      vassalHouseId: a!.id,
      ...since,
      terms: {} as never,
    });
    await w.vassalages.create({
      lordHouseId: c!.id,
      vassalHouseId: b!.id,
      ...since,
      terms: {} as never,
    });
    const filed = await w.disputes.file({
      lordHouseId: c!.id,
      plaintiffHouseId: b!.id,
      defendantHouseId: a!.id,
      message: 'Spor.',
      filedAt: NOW,
      filedDay: START - 2,
    });
    await w.disputes.judge(filed!.id, { kind: 'peace' }, START - 1, START + 1826);
    const result = await launchCampaign(w.deps, input(w.plan));
    expect(result.ok).toBe(true);
    expect(w.wars.all[0]).toMatchObject({ how: 'ambush' });
    expect(w.vassalages.breachLog).toMatchObject([{ id: va.id, kind: 'judgment', day: START }]);
    expect(w.disputes.rows[0]!.brokenBy).toEqual([a!.id]);
  });

  it('s odříznutou vsí se tažení nevyšle – nikdo neodejde, válka nevznikne; se stezkou ano', async () => {
    const cut = await world({ secondCut: 'enclosed' });
    const result = await launchCampaign(cut.deps, input(cut.plan));
    expect(result).toEqual({ ok: false, reason: CAMPAIGN_REASONS.noRoute });
    expect(cut.wars.all).toHaveLength(0);
    expect(cut.campaigns.rows.size).toBe(0);
    for (const id of [cut.ids.home, cut.ids.second]) {
      const state = (await cut.villages.find(id))!.state;
      expect(state.people.some((p) => p.away !== undefined)).toBe(false);
    }
    const open = await world({ secondCut: 'trail' });
    expect((await launchCampaign(open.deps, input(open.plan))).ok).toBe(true);
  });

  it('cíl v ochraně se nevyšle – nikdo neodejde, válka nevznikne', async () => {
    const w = await world({ targetProtectedHouse: true });
    const result = await launchCampaign(w.deps, input(w.plan));
    expect(result.ok).toBe(false);
    expect(w.wars.all).toHaveLength(0);
    expect(w.campaigns.rows.size).toBe(0);
    const home = (await w.villages.find(w.ids.home))!.state;
    expect(home.people.some((p) => p.away !== undefined)).toBe(false);
  });

  it('rozkaz k útoku na příbuzné sníží štěstí vsi o 5 za každého a nucený s příbuznými dezertuje častěji', async () => {
    const w = await world();
    await declareWarBetween(w);
    // vesničan 20 a vesničanova žena pocházejí z vsi na východě, kde leží cíl (sousední políčko)
    w.villages.edit(w.ids.home, (s) => {
      s.people.find((p) => p.id === w.forcedHome[0])!.origin = 'E';
    });
    const before = (await w.villages.find(w.ids.home))!.state.happiness?.deaths.length ?? 0;
    expect((await launchCampaign(w.deps, input(w.plan))).ok).toBe(true);
    const home = (await w.villages.find(w.ids.home))!.state;
    expect((home.happiness?.deaths.length ?? 0) - before).toBe(1);
    expect(home.happiness?.deaths.at(-1)?.points).toBe(5);
    const state = JSON.parse(w.campaigns.rows.get('camp-1')!.state) as {
      members: { ref: { personId: number; villageId: string }; kin?: true; strength: number }[];
    };
    const kin = state.members.find(
      (m) => m.ref.personId === w.forcedHome[0] && m.ref.villageId === w.ids.home,
    )!;
    const plain = state.members.find(
      (m) => m.ref.personId === w.forcedHome[1] && m.ref.villageId === w.ids.home,
    )!;
    expect(kin.kin).toBe(true);
    expect(plain.kin).toBeUndefined();
    expect(kin.strength).toBeLessThan(plain.strength);
  });

  it('nedaří-li se uložit další ves, muži a jídlo se vrátí', async () => {
    const w = await world();
    await declareWarBetween(w);
    const stores = (await w.villages.find(w.ids.home))!.state.storesKg;
    // Dub se při každém zápisu mezitím změní (souběžný požadavek) – uložení nikdy neprojde
    w.villages.beforeSave = (id): void => {
      if (id === w.ids.second) w.villages.edit(id, () => undefined);
    };
    const result = await launchCampaign(w.deps, input(w.plan));
    expect(result.ok).toBe(false);
    const home = (await w.villages.find(w.ids.home))!.state;
    expect(home.people.some((p) => p.away !== undefined)).toBe(false);
    expect(home.storesKg).toBe(stores);
    expect(w.campaigns.rows.size).toBe(0);
  });
});
