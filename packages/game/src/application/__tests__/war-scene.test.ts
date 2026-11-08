import { describe, expect, it } from 'vitest';
import type { CampaignMap, CampaignState } from '../../domain/war';
import type { Dwelling } from '../../domain/village/types';
import { attacker, battle, defender, land } from '../../domain/war/__tests__/battle-fixtures';
import { campaign, member } from '../../domain/war/__tests__/campaign-fixtures';
import type { Settlement } from '../settlements';
import type { VillageRecord, VillageStamp } from '../villages';
import { warSceneFor, type WarSceneDefender, type WarSceneDeps } from '../war-scene';
import { InMemoryCampaigns } from './in-memory-campaigns';

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
): Promise<{ deps: WarSceneDeps; campaigns: InMemoryCampaigns; reads: string[] }> {
  const campaigns = new InMemoryCampaigns();
  await campaigns.create(state);
  const villages: Record<string, VillageRecord> = {
    s9: { id: 'knezice', settlementId: 's9', state: { dwellings } } as unknown as VillageRecord,
    s1: { id: 'lhota', settlementId: 's1', state: { dwellings: [] } } as unknown as VillageRecord,
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
