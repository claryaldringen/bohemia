import { describe, expect, it } from 'vitest';
import type { CampaignMap, CampaignState, SeenCell, SeenData, SeenPart } from '../../domain/war';
import type { Dwelling, Person } from '../../domain/village/types';
import { attacker, battle, defender, land } from '../../domain/war/__tests__/battle-fixtures';
import { campaign, member, world } from '../../domain/war/__tests__/campaign-fixtures';
import type { House } from '../houses';
import type { Settlement } from '../settlements';
import type { VillageRecord, VillageStamp } from '../villages';
import {
  mapWatchFor,
  warSceneFor,
  warSceneOnMap,
  type MapWatchDeps,
  type WarSceneDefender,
  type WarSceneDeps,
} from '../war-scene';
import { InMemoryCampaigns } from './in-memory-campaigns';
import { InMemoryKnowledge } from './in-memory-knowledge';

// Válka ve scéně vlastní mapy (war.md – Ve scéně): obránce vidí svou ves celou a útočníky jen
// v dohledu svých lidí a domů; útočník vidí své vojsko na vlastní mapě; cizí mapa = nic.

/** Les na mapě cíle severně od bojiště (z ≈ 80–130 m). */
const forest = (tx: number, ty: number): boolean => tx >= 58 && tx <= 70 && ty >= 69 && ty <= 72;
const MAP: CampaignMap = { landscape: land(forest), obstacles: null, villageIds: [] };

const house = (id: number, x: number, z: number): Dwelling =>
  ({ id, type: 'zemnice', position: { x, z, rotation: 0 } }) as unknown as Dwelling;

/** Útok p1 na Kněžice (hráč p9): muži útoku u (0, 0), obránci podle `defenders`. */
function raiding(defenders: ReturnType<typeof defender>[]): CampaignState {
  const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
  return {
    ...base,
    phase: 'raiding',
    groups: base.groups.map((g) => ({ ...g, cell: { ...base.target.cell }, pos: { x: 0, z: 0 } })),
    battle: battle({
      attackers: [
        attacker(0, { x: 0, z: 0 }, { line: true, mounted: true }),
        attacker(1, { x: 5, z: 0 }),
      ],
      defenders,
      commander: 0,
    }),
  };
}

const settlement = (id: string, ownerId: string, x: number): Settlement =>
  ({ id, ownerId, worldCell: { x, y: 0 } }) as unknown as Settlement;

async function setup(
  state: CampaignState,
  dwellings: Dwelling[],
  people: Person[] = [],
): Promise<{ deps: WarSceneDeps; campaigns: InMemoryCampaigns; reads: string[] }> {
  const campaigns = new InMemoryCampaigns();
  await campaigns.create(state);
  const villages: Record<string, VillageRecord> = {
    s9: {
      id: 'knezice',
      settlementId: 's9',
      state: { dwellings, people },
    } as unknown as VillageRecord,
    s1: {
      id: 'lhota',
      settlementId: 's1',
      state: { dwellings: [], people: [] },
    } as unknown as VillageRecord,
  };
  const settlements: Record<string, Settlement> = {
    s9: settlement('s9', 'p9', 1),
    s1: settlement('s1', 'p1', 0),
  };
  const reads: string[] = [];
  const cache = new Map<string, WarSceneDefender>();
  const deps: WarSceneDeps = {
    settlements: { find: (id) => Promise.resolve(settlements[id] ?? null) },
    villages: {
      // otisk bez stavu – ves sídla
      stampsOf: (ids) =>
        Promise.resolve(
          ids.flatMap((id) =>
            villages[id] ? [{ id: villages[id].id, settlementId: id } as VillageStamp] : [],
          ),
        ),
      find: (id) => {
        reads.push(id);
        return Promise.resolve(Object.values(villages).find((v) => v.id === id) ?? null);
      },
    },
    campaigns,
    cells: { mapOf: () => Promise.resolve(MAP) },
    world,
    defenders: { get: (k) => cache.get(k), set: (k, v) => cache.set(k, v) },
  };
  return { deps, campaigns, reads };
}

describe('warSceneFor', () => {
  it('obránce vidí své muže celé a útočníky v dohledu svých mužů', async () => {
    const { deps } = await setup(raiding([defender(101, { x: 100, z: 0 })]), []);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.side).toBe('defend');
    expect(view?.march).toBeNull();
    const ids = view!.battle!.fighters.map((f) => f.id).sort();
    expect(ids).toEqual(['a:0', 'a:1', 'd:101']);
    // domov cizího muže se neprozradí
    const a0 = view!.battle!.fighters.find((f) => f.id === 'a:0')!;
    expect(a0.home).toEqual(a0.pos);
    expect(view!.battle!.fighters[0]).not.toHaveProperty('ref');
    expect(view!.battle!.fighters[0]).not.toHaveProperty('strength');
  });

  it('cizí muž bez zdraví – jen hrubý stav a počet zásahů; vlastní se zdravím', async () => {
    const state = raiding([defender(101, { x: 100, z: 0 })]);
    const a1 = state.battle!.fighters.find((f) => f.id === 'a:1')!;
    a1.health = 37;
    a1.hits = 2;
    const { deps } = await setup(state, []);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    const seen = new Map(view!.battle!.fighters.map((f) => [f.id, f]));
    expect(seen.get('a:1')).not.toHaveProperty('health');
    expect(seen.get('a:1')).toMatchObject({ hits: 2, state: 'fight', killed: false });
    expect(seen.get('d:101')!.health).toBe(100);
  });

  it('dva dotazy v tomtéž herním dni čtou ves jen jednou, nový den znovu', async () => {
    const { deps, campaigns, reads } = await setup(raiding([defender(101, { x: 100, z: 0 })]), [
      house(7, 60, 0),
    ]);
    await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(reads).toEqual(['knezice']);
    const point = await campaigns.checkpoint('c1');
    await campaigns.create({ ...point!.state, day: point!.state.day + 1 });
    await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(reads).toEqual(['knezice', 'knezice']);
  });

  it('mlha: útočníci mimo dohled obránců i domů nejsou; mířit na ně nejde vidět', async () => {
    // obránce 400 m od útočníků, dům v lese 100 m od nich (les zkrátí dohled na 50 m)
    const state = raiding([defender(103, { x: 400, z: 0 })]);
    const d = state.battle!.fighters.find((f) => f.id === 'd:103')!;
    d.aim = 'a:0';
    const { deps } = await setup(state, [house(7, 0, 100)]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view!.battle!.fighters.map((f) => f.id)).toEqual(['d:103']);
    expect(view!.battle!.fighters[0]!.aim).toBeNull();
    expect(view!.battle!.groups.every((g) => g.side === 'defend')).toBe(true);
  });

  it('domy vsi vidí útočníky i bez obránců na nohou (útěk do lesa)', async () => {
    const { deps } = await setup(raiding([]), [house(7, 60, 0)]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view!.battle!.fighters.map((f) => f.id).sort()).toEqual(['a:0', 'a:1']);
  });

  it('po rozhodnutém boji pochod – vojsko v dohledu domů', async () => {
    const state = raiding([]);
    state.battle!.outcome = 'attackers';
    const { deps } = await setup(state, [house(7, 60, 0)]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.battle).toBeNull();
    expect(view?.march?.members).toHaveLength(2);
  });

  it('padlí leží do konce dne i po odchodu vojska z mapy; ves utekla do lesa ze stavu vsi', async () => {
    const state = raiding([defender(101, { x: 40, z: 0 })]);
    const d = state.battle!.fighters.find((f) => f.id === 'd:101')!;
    Object.assign(d, { state: 'down', killed: true, health: 0 });
    state.battle!.outcome = 'attackers';
    state.battle!.openTick = state.tick - 10;
    state.battle!.shelter = {
      stance: 'flee',
      refuge: [],
      forest: [5],
      surrendered: [],
      carriedKg: 25,
      livestockRefuge: { sheep: 0, goat: 0, pig: 0, cow: 0 },
      livestockForest: { sheep: 6, goat: 0, pig: 0, cow: 0 },
    };
    // vojsko už je na sousední mapě, výsledek nájezdu odešel dnes
    const gone: CampaignState = {
      ...state,
      phase: 'returning',
      raidDay: state.day,
      groups: state.groups.map((g) => ({ ...g, cell: { x: 0, y: 0 } })),
    };
    const woman = { id: 5, dwellingId: 7, bornDay: state.day - 30 * 365, sex: 'female' } as Person;
    const { deps, campaigns } = await setup(gone, [house(7, 60, 0)], [woman]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.march).toBeNull();
    expect(view?.battle?.fighters.map((f) => f.id)).toEqual(['d:101']);
    expect(view?.flight).toMatchObject({ startTick: state.tick - 10, herd: 6 });
    expect(view?.flight?.people.map((p) => [p.id, p.kind, p.carries])).toEqual([
      [5, 'woman', true],
    ]);
    // další den – nic (lidé se vrátí se vsí)
    await campaigns.create({ ...gone, day: gone.day + 1 });
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });

  it('útočník vidí vlastní vojsko na pochodu na své mapě, jinde nic', async () => {
    const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
    const { deps, campaigns } = await setup(base, []);
    const own = await warSceneFor(deps, { playerId: 'p1', settlementId: 's1' });
    expect(own?.side).toBe('attack');
    expect(own?.battle).toBeNull();
    expect(own!.march!.members).toHaveLength(2);
    expect(own!.march!.members[0]).not.toHaveProperty('ref');
    expect(Math.hypot(own!.march!.groups[0]!.heading.x, own!.march!.groups[0]!.heading.z)).toBe(1);
    // vojsko na mapě cíle, obránce ho nevidí (žádné domy ani muži)
    const away: CampaignState = {
      ...base,
      groups: base.groups.map((g) => ({ ...g, cell: { x: 1, y: 0 }, pos: { x: 0, z: 0 } })),
    };
    await campaigns.create({ ...away, id: 'c2' });
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });

  it('cizí sídlo – nic', async () => {
    const { deps } = await setup(raiding([defender(101, { x: 100, z: 0 })]), []);
    expect(await warSceneFor(deps, { playerId: 'p1', settlementId: 's9' })).toBeNull();
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 'nic' })).toBeNull();
  });
});

describe('staré vojsko po Začít znovu ve scéně (war.md – Začít znovu během nájezdu)', () => {
  const TARGET = { x: 1, y: 0 };

  /** Tažení vede rod `h-old`, který skončil – hráč p1 má nový rod. */
  async function restarted(): Promise<{ deps: WarSceneDeps; state: CampaignState }> {
    const state = { ...raiding([defender(101, { x: 100, z: 0 })]), houseId: 'h-old' };
    const { deps } = await setup(state, []);
    const houses = {
      activeOf: (playerId: string): Promise<House | null> =>
        Promise.resolve(playerId === 'p1' ? ({ id: 'h-new' } as House) : null),
    };
    return { deps: { ...deps, houses }, state };
  }

  it('nová hra útočníka staré vojsko nevidí ani podvrženým id na cizí mapě, ani na své mapě', async () => {
    const { deps } = await restarted();
    expect(
      await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'c1', cell: TARGET }),
    ).toBeNull();
    const march = campaign({ members: [member(1, 0, true)] });
    await (deps.campaigns as InMemoryCampaigns).create({ ...march, id: 'c2', houseId: 'h-old' });
    expect(await warSceneFor(deps, { playerId: 'p1', settlementId: 's1' })).toBeNull();
  });

  it('obránce cizí vojsko starého rodu vidí dál', async () => {
    const { deps } = await restarted();
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.side).toBe('defend');
  });
});

describe('warSceneOnMap – útočník na cizí mapě', () => {
  const TARGET = { x: 1, y: 0 };

  it('vojsko tažení celé se zdravím, obránci jen v dohledu jeho mužů', async () => {
    // obránce 100 m od útočníků je vidět, obránce 600 m daleko ne
    const state = raiding([defender(101, { x: 100, z: 0 }), defender(102, { x: 600, z: 0 })]);
    const { deps } = await setup(state, []);
    const view = await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'c1', cell: TARGET });
    expect(view?.side).toBe('attack');
    const seen = new Map(view!.battle!.fighters.map((f) => [f.id, f]));
    expect([...seen.keys()].sort()).toEqual(['a:0', 'a:1', 'd:101']);
    expect(seen.get('a:0')!.health).toBe(100);
    expect(seen.get('d:101')).not.toHaveProperty('health');
    expect(seen.get('d:101')!.home).toEqual(seen.get('d:101')!.pos);
  });

  it('z cizí vsi jen objevené domy – neobjevený dům se nepošle', async () => {
    const state = { ...raiding([]), discovered: [7] };
    const { deps } = await setup(state, [house(7, 60, 0), house(8, 500, 0)]);
    const view = await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'c1', cell: TARGET });
    expect(view!.buildings).toEqual([
      { id: 7, type: 'zemnice', position: { x: 60, z: 0, rotation: 0 } },
    ]);
    // nic objeveného – pole chybí
    const { deps: none } = await setup(raiding([]), [house(7, 60, 0)]);
    const blind = await warSceneOnMap(none, { playerId: 'p1', campaignId: 'c1', cell: TARGET });
    expect(blind).not.toHaveProperty('buildings');
  });

  it('obránce na své mapě cizí domy nedostane (svou ves kreslí ze stavu)', async () => {
    const state = { ...raiding([defender(101, { x: 100, z: 0 })]), discovered: [7] };
    const { deps } = await setup(state, [house(7, 60, 0)]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.side).toBe('defend');
    expect(view).not.toHaveProperty('buildings');
  });

  it('cizí hráč, jiná mapa, odchod vojska a konec tažení – nic', async () => {
    const { deps, campaigns } = await setup(raiding([defender(101, { x: 100, z: 0 })]), []);
    // obránce tažení nezná – na cizí mapu se jeho očima nedívá
    expect(
      await warSceneOnMap(deps, { playerId: 'p9', campaignId: 'c1', cell: TARGET }),
    ).toBeNull();
    expect(
      await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'nic', cell: TARGET }),
    ).toBeNull();
    // vojsko na mapě nestojí
    expect(
      await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'c1', cell: { x: 5, y: 5 } }),
    ).toBeNull();
    const point = await campaigns.checkpoint('c1');
    await campaigns.create({ ...point!.state, phase: 'done' });
    expect(
      await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'c1', cell: TARGET }),
    ).toBeNull();
  });

  it('vazal ve službě vidí vojsko tažení na cizí mapě taky', async () => {
    const base = raiding([]);
    const state: CampaignState = {
      ...base,
      members: [...base.members, { ...base.members[1]!, playerId: 'p5' }],
    };
    const { deps } = await setup(state, []);
    const view = await warSceneOnMap(deps, { playerId: 'p5', campaignId: 'c1', cell: TARGET });
    expect(view?.side).toBe('attack');
    expect(view!.battle!.fighters.length).toBeGreaterThan(0);
  });

  it('znalost rodu na mapě cíle (Úloha 11): známé stavby a stopa; zaniklý dům, dokud ho muži neuvidí', async () => {
    const part = (key: string, x: number, z: number): SeenPart => ({
      key,
      pos: { x, z },
      day: 3,
      data: { kind: key.split(':')[0] } as SeenData,
    });
    // dům 5 a 6 už ve vsi nejsou – 5 je 100 m od mužů (vidí jeho místo), 6 daleko; 7 je objevený
    // (scéna ho kreslí živě), 8 stojí; opevnění vidí útočník ze stavu vsi jako dřív
    const known: SeenCell = {
      villageId: 'knezice',
      trail: [[-880, 20]],
      parts: [
        part('dwelling:5', 100, 0),
        part('dwelling:6', 700, 0),
        part('dwelling:7', 60, 0),
        part('dwelling:8', 500, 0),
        part('fortification:1', 0, 300),
      ],
    };
    const state: CampaignState = {
      ...raiding([]),
      discovered: [7],
      houseId: 'h1',
      seen: { '1,0': { villageId: 'knezice', trail: [[0, 0]], parts: [] } },
    };
    const { deps } = await setup(state, [house(7, 60, 0), house(8, 500, 0)]);
    const knowledge = new InMemoryKnowledge();
    await knowledge.merge('h1', TARGET, known);
    const all = { ...deps, knowledge };
    const view = await warSceneOnMap(all, { playerId: 'p1', campaignId: 'c1', cell: TARGET });
    expect(view!.buildings!.map((b) => b.id)).toEqual([7]);
    expect(view!.known).toEqual({
      villageId: 'knezice',
      trail: [
        [-880, 20],
        [0, 0],
      ],
      parts: [known.parts[1], known.parts[3]],
    });
    // bez úložiště znalosti jen vlastní stopa tažení; obránce znalost útočníka nedostane
    const blind = await warSceneOnMap(deps, { playerId: 'p1', campaignId: 'c1', cell: TARGET });
    expect(blind!.known).toEqual({ villageId: 'knezice', trail: [[0, 0]], parts: [] });
    const defending = await warSceneFor(all, { playerId: 'p9', settlementId: 's9' });
    expect(defending?.side).toBe('defend');
    expect(defending).not.toHaveProperty('known');
  });

  it('mapa po cestě v dohledu tažení: shořelý dům se nekreslí, nový ano – sloučení se `seen` tažení', async () => {
    const WAY = { x: 2, y: 0 };
    const part = (key: string, x: number, day: number): SeenPart => ({
      key,
      pos: { x, z: 0 },
      day,
      data: { kind: 'dwelling' } as SeenData,
    });
    const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
    // rod zná dům 5 z dřívějška; tažení teď v dohledu vidí, že dům 5 zmizel a stojí dům 9
    const onWay: CampaignState = {
      ...base,
      houseId: 'h1',
      groups: base.groups.map((g) => ({ ...g, cell: { ...WAY }, pos: { x: 0, z: 0 } })),
      seen: {
        '2,0': {
          villageId: 'brod',
          trail: [[0, 0]],
          parts: [part('dwelling:9', 20, 7)],
          gone: [{ key: 'dwelling:5', day: 7 }],
        },
      },
    };
    const { deps } = await setup(onWay, []);
    const knowledge = new InMemoryKnowledge();
    await knowledge.merge('h1', WAY, {
      villageId: 'brod',
      trail: [[300, 40]],
      parts: [part('dwelling:5', 300, 3)],
    });
    const view = await warSceneOnMap(
      { ...deps, knowledge },
      { playerId: 'p1', campaignId: 'c1', cell: WAY },
    );
    expect(view!.known!.parts.map((p) => p.key)).toEqual(['dwelling:9']);
    expect(view!.known!.trail).toEqual([
      [0, 0],
      [300, 40],
    ]);
  });

  it('znalost rodu na mapě po cestě (Úloha 12b): znalost té mapy, jak je – jeden dotaz na pohled', async () => {
    const WAY = { x: 2, y: 0 };
    const part = (key: string, x: number, z: number): SeenPart => ({
      key,
      pos: { x, z },
      day: 3,
      data: { kind: key.split(':')[0] } as SeenData,
    });
    const base = campaign({ members: [member(1, 0, true), member(2, 0, false)] });
    // vojsko na mapě vsi Brod (ani shromaždiště, ani cíl); vazal p5 ve službě
    const onWay: CampaignState = {
      ...base,
      houseId: 'h1',
      members: [...base.members, { ...base.members[1]!, playerId: 'p5' }],
      groups: base.groups.map((g) => ({ ...g, cell: { ...WAY }, pos: { x: 0, z: 0 } })),
    };
    const { deps, campaigns } = await setup(onWay, []);
    const knowledge = new InMemoryKnowledge();
    await knowledge.merge('h1', WAY, {
      villageId: 'brod',
      trail: [[300, 40]],
      parts: [part('dwelling:5', 300, 0), part('fortification:1', 0, 300)],
    });
    // jiná mapa téhož rodu a táž mapa jiného rodu se do pohledu nepletou
    await knowledge.merge('h1', TARGET, { villageId: 'knezice', trail: [[0, 0]], parts: [] });
    await knowledge.merge('h5', WAY, { villageId: 'brod', trail: [[-400, 0]], parts: [] });
    const reads: string[] = [];
    // živý rod vůdce – tažení vede (`mayHandleCampaign`); bod bez rodu níž dostane jiný
    let leaderHouse = 'h1';
    const all: WarSceneDeps = {
      ...deps,
      knowledge: {
        of: (houseId, cell) => {
          reads.push(`${houseId}|${cell.x},${cell.y}`);
          return knowledge.of(houseId, cell);
        },
      },
      houses: {
        activeOf: (playerId: string): Promise<House | null> =>
          Promise.resolve(
            playerId === 'p5' ? ({ id: 'h5' } as House) : ({ id: leaderHouse } as House),
          ),
      },
    };
    const view = await warSceneOnMap(all, { playerId: 'p1', campaignId: 'c1', cell: WAY });
    expect(view?.side).toBe('attack');
    // znalost rodu vůdce o té mapě celá (i opevnění – scéna ho ze znalosti nekreslí)
    expect(view!.known).toEqual(await knowledge.of('h1', WAY));
    expect(view!.known!.parts.map((p) => p.key)).toEqual(['dwelling:5', 'fortification:1']);
    expect(view).not.toHaveProperty('buildings');
    expect(reads).toEqual(['h1|2,0']);
    // vazal ve službě vidí znalost svého rodu
    const vassal = await warSceneOnMap(all, { playerId: 'p5', campaignId: 'c1', cell: WAY });
    expect(vassal!.known).toEqual(await knowledge.of('h5', WAY));
    // bod bez rodu vůdce – rod podle hráče; rod mapu nezná – pole chybí
    leaderHouse = 'h-jiny';
    await campaigns.create({ ...onWay, houseId: undefined });
    const unknown = await warSceneOnMap(all, { playerId: 'p1', campaignId: 'c1', cell: WAY });
    expect(unknown?.side).toBe('attack');
    expect(unknown).not.toHaveProperty('known');
    expect(reads.slice(-1)).toEqual(['h-jiny|2,0']);
    // obránce tažení nezná – nic
    expect(await warSceneOnMap(all, { playerId: 'p9', campaignId: 'c1', cell: WAY })).toBeNull();
  });
});

describe('warSceneFor – průvod uprchlíků (Ú14)', () => {
  /** Tažení p1 na Brod jde jinudy; Kněžice (p9) varované, jejich skupina jde přes svou mapu. */
  function passing(): CampaignState {
    const base = campaign({ members: [member(1, 0, true)] });
    return {
      ...base,
      phase: 'marching',
      target: { villageId: 'brod', cell: { x: 3, y: 0 }, pos: { x: 0, z: 0 } },
      groups: base.groups.map((g) => ({ ...g, cell: { x: 0, y: 0 }, pos: { x: 0, z: 0 } })),
      alarm: {
        villages: [
          {
            villageId: 'knezice',
            owner: { playerId: 'p9', npc: false, houseId: 'h9' },
            seenTick: base.tick,
            seenAt: { cell: { x: 1, y: 0 }, pos: { x: 0, z: 0 } },
            warnTick: base.tick,
            by: 'villager',
            flight: 'c1:a1',
          },
        ],
        messengers: [],
        flights: [
          {
            refId: 'c1:a1',
            villageId: 'knezice',
            mode: 'people',
            hostVillageId: 'hradek',
            cell: { x: 1, y: 0 },
            pos: { x: 300, z: 0 },
            route: [{ x: 2, y: 0 }],
            leg: null,
            target: { cell: { x: 2, y: 0 }, pos: { x: 0, z: 0 } },
            people: [{ id: 1, bornDay: base.day - 30 * 365, man: true, line: true }],
            foodKg: 0,
            herd: { sheep: 0, goat: 0, pig: 0, cow: 0 },
            carts: 0,
            status: 'marching',
            departTick: base.tick,
          },
        ],
        nextRef: 2,
      },
    };
  }

  it('obránce vidí svou skupinu i z tažení, které ves jen varovalo (vojsko jinde)', async () => {
    const { deps } = await setup(passing(), [house(1, -600, -600)]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.side).toBe('defend');
    expect(view?.march).toBeNull();
    expect(view?.refugeMarch?.map((m) => [m.refId, m.own, m.people.length])).toEqual([
      ['c1:a1', true, 1],
    ]);
  });

  it('skupina v hradišti – na mapě nic', async () => {
    const state = passing();
    state.alarm!.flights[0]!.status = 'arrived';
    const { deps } = await setup(state, [house(1, -600, -600)]);
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });
});

describe('warSceneFor – vojvoda doma vidí celé vojsko', () => {
  /** Vojsko p1 mířící na Brod míjí mapu Kněžic (p9) 900 m od domů; ves varovaná, vojvoda je č. 1. */
  function passingBy(): CampaignState {
    const base = campaign({ members: [member(1, 0, true)] });
    return {
      ...base,
      phase: 'marching',
      target: { villageId: 'brod', cell: { x: 3, y: 0 }, pos: { x: 0, z: 0 } },
      groups: base.groups.map((g) => ({ ...g, cell: { x: 1, y: 0 }, pos: { x: 900, z: 900 } })),
      alarm: {
        villages: [
          {
            villageId: 'knezice',
            owner: { playerId: 'p9', npc: false, houseId: 'h9', lordId: 1 },
            seenTick: base.tick,
            seenAt: { cell: { x: 1, y: 0 }, pos: { x: 900, z: 900 } },
            warnTick: base.tick,
            by: 'lord',
          },
        ],
        messengers: [],
        flights: [],
        nextRef: 1,
      },
    };
  }
  const lord = { id: 1, bornDay: -30 * 365, sex: 'male' } as Person;

  it('vojsko, které ves jen míjí, je s vojvodou doma vidět', async () => {
    const { deps } = await setup(passingBy(), [house(1, -600, -600)], [lord]);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.side).toBe('defend');
    expect(view?.march?.groups).toHaveLength(1);
  });

  it('s vojvodou na výjezdu jen v dohledu, jako dřív', async () => {
    const away = { ...lord, away: { kind: 'journey' } } as unknown as Person;
    const { deps } = await setup(passingBy(), [house(1, -600, -600)], [away]);
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
    // bez vojvody ve vsi také
    const none = await setup(passingBy(), [house(1, -600, -600)], []);
    expect(await warSceneFor(none.deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });

  it('vojvoda, kterého tažení odvedlo (`alarmTaken` – zajetí), celé vojsko nevidí', async () => {
    // stav vsi o zajetí ještě neví – doména ho za doma nemá (`lordHomeAt`), scéna také ne
    const held = passingBy();
    held.captives.push({ villageId: 'knezice', personId: 1 });
    const { deps } = await setup(held, [house(1, -600, -600)], [lord]);
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });

  it('ves, která ještě neví (warnTick v budoucnu), nevidí celé vojsko', async () => {
    const state = passingBy();
    state.alarm!.villages[0]!.warnTick = state.tick + 50;
    const { deps } = await setup(state, [house(1, -600, -600)], [lord]);
    expect(await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });

  it('boj má přednost před vojskem, které ves jen míjí', async () => {
    const { deps, campaigns } = await setup(passingBy(), [house(1, -600, -600)], [lord]);
    const fight = { ...raiding([defender(101, { x: 100, z: 0 })]), id: 'c2' };
    await campaigns.create(fight);
    const view = await warSceneFor(deps, { playerId: 'p9', settlementId: 's9' });
    expect(view?.campaignId).toBe('c2');
    expect(view?.battle).not.toBeNull();
  });
});

describe('mapWatchFor – válka a jezdci na mapě vsi (D62)', () => {
  /** Kněžice (p9, políčko 1,0) a Lhota (p1, políčko 0,0); výpravy na políčcích `riders`. */
  async function watchDeps(
    states: CampaignState[],
    riders: { x: number; y: number }[] = [],
  ): Promise<MapWatchDeps> {
    const campaigns = new InMemoryCampaigns();
    for (const state of states) await campaigns.create(state);
    const settlements: Record<string, Settlement> = {
      s9: settlement('s9', 'p9', 1),
      s1: settlement('s1', 'p1', 0),
    };
    const stamps: Record<string, VillageStamp> = {
      knezice: { id: 'knezice', settlementId: 's9' } as VillageStamp,
      lhota: { id: 'lhota', settlementId: 's1' } as VillageStamp,
    };
    return {
      settlements: { find: (id) => Promise.resolve(settlements[id] ?? null) },
      villages: {
        stampsOfVillages: (ids) => Promise.resolve(ids.flatMap((id) => stamps[id] ?? [])),
      },
      campaigns,
      journeys: {
        onCell: (cell) =>
          Promise.resolve(riders.some((r) => r.x === cell.x && r.y === cell.y) ? ['j1'] : []),
      },
    };
  }

  it('bez tažení a výprav na mapě nic – scéna se na válku ani jezdce neptá', async () => {
    const deps = await watchDeps([]);
    expect(await mapWatchFor(deps, { playerId: 'p9', villageId: 'knezice' })).toEqual({
      war: false,
      riders: false,
    });
  });

  it('cizí vojsko na mapě vsi i tažení, které na ni teprve míří – válka', async () => {
    const raid = raiding([defender(101, { x: 100, z: 0 })]);
    expect(
      await mapWatchFor(await watchDeps([raid]), { playerId: 'p9', villageId: 'knezice' }),
    ).toEqual({ war: true, riders: false });
    // vojsko stojí ještě na shromaždišti ve Lhotě – co z něj je vidět, rozhodne až `warSceneFor`
    const away = campaign({ members: [member(1, 0, true)] });
    const deps = await watchDeps([away]);
    expect(await mapWatchFor(deps, { playerId: 'p9', villageId: 'knezice' })).toEqual({
      war: true,
      riders: false,
    });
    const scene = await setup(away, [house(7, 60, 0)]);
    expect(await warSceneFor(scene.deps, { playerId: 'p9', settlementId: 's9' })).toBeNull();
  });

  it('vlastní tažení – válka (vojsko může stát na mapě); výprava na mapě – jezdci', async () => {
    const away = campaign({ members: [member(1, 0, true)] });
    const deps = await watchDeps([away], [{ x: 0, y: 0 }]);
    expect(await mapWatchFor(deps, { playerId: 'p1', villageId: 'lhota' })).toEqual({
      war: true,
      riders: true,
    });
  });

  it('ves na sídle jiného hráče – nic', async () => {
    const deps = await watchDeps([raiding([])], [{ x: 1, y: 0 }]);
    expect(await mapWatchFor(deps, { playerId: 'p1', villageId: 'knezice' })).toEqual({
      war: false,
      riders: false,
    });
  });
});
