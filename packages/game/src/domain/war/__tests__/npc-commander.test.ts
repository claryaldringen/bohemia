import { describe, expect, it } from 'vitest';
import type { NewVillageEvent } from '../../village/inbox';
import { kin, village } from '../../village/__tests__/kin-fixtures';
import type { Dwelling, Person, VillageState } from '../../village/types';
import { stepCampaign } from '../campaign';
import type { CampaignMap, CampaignState, CampaignWorld } from '../campaign-types';
import { npcIntents } from '../npc-commander';
import { land, palisade } from './battle-fixtures';
import {
  campaign,
  flat,
  intent,
  LAUNCH,
  LIVE,
  SET_OUT,
  SUMMER,
  world,
  worldOf,
} from './campaign-fixtures';

// NPC velitel, zástupce a rozpad výpravy (war.md – Velení a příprava tažení; plán 2026-11-03 –
// Úloha 6.12).

const MEADOW: CampaignMap = { landscape: flat(), obstacles: null, villageIds: [] };
const house = (id: number, x: number, z = 0): Dwelling => ({
  id,
  type: 'zemnice',
  builtDay: 0,
  condition: 1,
  position: { x, z, rotation: 0 },
});
const man = (id: number, home: number): Person => kin({ id, age: 30, sex: 'male', home }, SUMMER);
const livestock = {
  herds: { sheep: 10, goat: 4, pig: 2, cow: 3 },
  young: { sheep: 2, goat: 0, pig: 0, cow: 1 },
};

/** Svět s cílovou vsí na mapě (1, 0); ostatní mapy jsou louky. */
function worldWith(id: string, map: CampaignMap, state: VillageState): CampaignWorld {
  return {
    clock: world,
    landscapeOf: (cell) => (cell.x === 1 && cell.y === 0 ? map : MEADOW),
    villageAt: (v) => (v === id ? state : null),
  };
}

function inChunks(
  start: CampaignState,
  toTick: number,
  chunk: number,
  w: CampaignWorld,
): { state: CampaignState; events: NewVillageEvent[] } {
  let s = start;
  const events: NewVillageEvent[] = [];
  while (s.tick < toTick && s.phase !== 'done') {
    const step = stepCampaign(s, Math.min(toTick, s.tick + chunk), SET_OUT, w);
    s = step.state;
    events.push(...step.villageEvents);
  }
  return { state: s, events };
}

// --- Bránící se slabší ves na sousední mapě -----------------------------------------------------

/** Kněžice: dva muži a žena u domu u cíle tažení, postoj „bránit se“. */
function knezice(): VillageState {
  const v = village(
    [man(1, 1), man(2, 1), kin({ id: 3, age: 28, sex: 'female', home: 1 }, SUMMER)],
    [house(1, -860, 30)],
    {
      lastDay: SUMMER,
      storesKg: 400,
      defense: { stance: 'defend' },
    },
  );
  return v;
}
const KNEZICE = knezice();
const defendWorld = worldWith(
  'knezice',
  { landscape: flat(), obstacles: null, villageIds: ['knezice'] },
  KNEZICE,
);
const NPC = campaign({
  liveCommand: false,
  target: { villageId: 'knezice', name: 'Kněžice', cell: { x: 1, y: 0 }, pos: { x: -880, z: 30 } },
});
const END = LAUNCH + 3000;

describe('NPC velitel – nájezd na bránící se ves', () => {
  const whole = stepCampaign(NPC, END, SET_OUT, defendWorld);
  const result = whole.villageEvents.find((e) => e.body.kind === 'raid-result')?.body;

  // násobek zrušen 8. 11. 2026 – síla obránců je jen součet sil (dřív × 1,5 u domu)
  it('napadne slabší ves (síla nad 1,5 × obránci), vyhraje a vrátí se s kořistí', () => {
    expect(whole.state.phase).toBe('done');
    expect(whole.state.battle?.outcome).toBe('attackers');
    expect(whole.state.battle?.plundered).toBeUndefined();
    if (result?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    expect(result.result.fallen.length + result.result.wounded.length).toBeGreaterThan(0);
    expect(result.result.loot.grainKg).toBeGreaterThan(0);
    expect(whole.state.returnReason).toBe('arrived');
  });

  it('po kouscích 1 / 7 / 100 taktů = vcelku', () => {
    for (const chunk of [1, 7, 100]) {
      const parts = inChunks(NPC, END, chunk, defendWorld);
      expect(JSON.stringify(parts.state)).toBe(JSON.stringify(whole.state));
      expect(JSON.stringify(parts.events)).toBe(JSON.stringify(whole.villageEvents));
    }
  });

  it('bod zlomu skupiny velitele → obrat', () => {
    let s = NPC;
    while (!s.battle && s.phase !== 'done')
      s = stepCampaign(s, s.tick + 5, SET_OUT, defendWorld).state;
    expect(s.phase).toBe('raiding');
    expect(npcIntents(s, defendWorld).some((i) => i.kind === 'turn-back')).toBe(false);
    const broken = structuredClone(s);
    for (const g of broken.battle!.groups) if (g.side === 'attack' && g.id === 0) g.broken = true;
    expect(npcIntents(broken, defendWorld)).toEqual([{ kind: 'turn-back', reason: 'routed' }]);
  });
});

// --- Silnější ves za palisádou ------------------------------------------------------------------

/** Hrádek: pět mužů a žena v domě 70 m od středu palisády (útočiště), zásoby a dobytek. */
function hradek(): VillageState {
  return village(
    [1, 2, 3, 4, 5]
      .map((id) => man(id, 1))
      .concat(kin({ id: 6, age: 25, sex: 'female', home: 1 }, SUMMER)),
    [house(1, 70)],
    {
      lastDay: SUMMER,
      storesKg: 500,
      livestock,
      fortifications: [palisade(true)],
      defense: { stance: 'defend' },
    },
  );
}

describe('NPC velitel – silná ves za palisádou', () => {
  const fortWorld = worldWith(
    'hradek',
    { landscape: land(), obstacles: null, villageIds: ['hradek'] },
    hradek(),
  );
  const start = campaign({
    liveCommand: false,
    target: { villageId: 'hradek', name: 'Hrádek', cell: { x: 1, y: 0 }, pos: { x: -200, z: 0 } },
  });
  const whole = stepCampaign(start, END, SET_OUT, fortWorld);

  // násobek zrušen 8. 11. 2026 – síla obránců je jen součet sil (dřív × 1,5 × násobek palisády);
  // všichni obránci uvnitř obvodu → vezme, co je venku (přechod hradby přidá Úloha 20)
  it('nenapadne (pod 1,5 × obránci) a vezme jen, co je venku', () => {
    expect(whole.state.phase).toBe('done');
    expect(whole.state.battle?.plundered).toBe(true);
    const body = whole.villageEvents.find((e) => e.body.kind === 'raid-result')?.body;
    if (body?.kind !== 'raid-result') throw new Error('chybí výsledek nájezdu');
    const r = body.result;
    expect(r.fallen).toEqual([]);
    expect(r.wounded).toEqual([]);
    expect(whole.state.battle?.breaches).toEqual([]);
    // dobytek je v útočišti, zásoby odnesené do útočiště zůstanou
    expect(Object.values(r.loot.livestock).every((n) => n === 0)).toBe(true);
    expect(r.loot.grainKg).toBeGreaterThan(0);
    expect(r.loot.grainKg).toBeLessThanOrEqual(3 * 25);
  });
});

// --- Obrat při polovině vojska, plné nosnosti a jídle na cestu domů ------------------------------

describe('NPC velitel – obrat', () => {
  /** Pochod NPC na mapě (3, 0) – 4,9 km od shromaždiště. */
  function far(food: number): CampaignState {
    const s = campaign({ liveCommand: false, foodKg: food });
    s.phase = 'marching';
    for (const g of s.groups) {
      g.cell = { x: 3, y: 0 };
      g.pos = { x: 0, z: 0 };
      g.goal = { cell: { ...s.target.cell }, pos: { ...s.target.pos } };
    }
    return s;
  }

  it('jídla jen na cestu domů → obrat (≈ 16 dní × 3 muži)', () => {
    expect(npcIntents(far(40), worldOf())).toEqual([{ kind: 'turn-back', reason: 'supplies' }]);
    expect(npcIntents(far(60), worldOf())).toEqual([]);
  });

  it('padlá polovina vojska → obrat; jeden ze tří ještě ne', () => {
    const one = far(100);
    one.members[2]!.status = 'fallen';
    expect(npcIntents(one, worldOf())).toEqual([]);
    const two = far(100);
    two.members[1]!.status = 'fallen';
    two.members[2]!.status = 'deserted';
    expect(npcIntents(two, worldOf())).toEqual([{ kind: 'turn-back', reason: 'routed' }]);
  });

  it('plná nosnost (3 × 25 kg spolu s vlastním jídlem) → obrat', () => {
    const full = far(100);
    full.supplies.foodKg = 60;
    full.loot = { foodKg: 15, herd: 0 };
    expect(npcIntents(full, worldOf())).toEqual([{ kind: 'turn-back', reason: 'arrived' }]);
    full.loot.foodKg = 10;
    expect(npcIntents(full, worldOf())).toEqual([]);
  });
});

// --- Přítomnost, zástupce a rozpad -------------------------------------------------------------

describe('přítomnost hráče, zástupce a rozpad', () => {
  const homes = { brod: { cell: { x: 0, y: 1 }, pos: { x: 0, z: 0 } } };
  const farTarget = { villageId: 'daleko', cell: { x: 3, y: 0 }, pos: { x: 0, z: 0 } };
  const live = (deputy: CampaignState['deputy'] = null): CampaignState =>
    campaign({ target: farTarget, homes, deputy, foodKg: 200 });
  // vyslání v taktu LAUNCH + 2; 1 herní den ≈ 345 taktů
  const LAST = LAUNCH + 2 + 345;

  it('bez přítomnosti a bez zástupce se výprava po 1 herním dni rozpadne do hloučků po vsích', () => {
    const before = stepCampaign(live(), LAST, SET_OUT, worldOf());
    expect(before.state.phase).toBe('marching');
    const after = stepCampaign(before.state, LAST + 1, SET_OUT, worldOf());
    expect(after.state.phase).toBe('disbanded');
    expect(after.notices).toEqual([
      {
        playerId: 'p1',
        kind: 'campaign-disbanded',
        payload: { campaignId: 'c1', leader: 'Bořivoj' },
        gameDay: after.state.day,
      },
    ]);
    const chronicles = after.villageEvents.flatMap((e) =>
      e.body.kind === 'chronicle' ? [[e.villageId, e.body.event]] : [],
    );
    expect(chronicles).toEqual([
      [
        'lhota',
        { day: after.state.day + 1, kind: 'campaign', step: 'disbanded', leader: 'Bořivoj' },
      ],
      [
        'brod',
        { day: after.state.day + 1, kind: 'campaign', step: 'disbanded', leader: 'Bořivoj' },
      ],
    ]);
    // hloučky podle vsí domů – Lhota do shromaždiště, Brod domů
    const groups = after.state.groups.map((g) => ({
      men: after.state.members.filter((m) => m.group === g.id).map((m) => m.ref.personId),
      goal: g.goal,
    }));
    expect(groups).toEqual([
      { men: [1, 2], goal: { cell: { x: 0, y: 0 }, pos: { x: 880, z: 0 } } },
      { men: [11], goal: homes.brod },
    ]);
    // doma: muži zpět, bez zápisu „vrátilo se“ a bez upozornění o návratu
    const done = stepCampaign(after.state, LAUNCH + 20000, SET_OUT, worldOf());
    expect(done.state.phase).toBe('done');
    expect(done.villageEvents.map((e) => [e.villageId, e.body.kind])).toEqual([
      ['lhota', 'campaign-return'],
      ['brod', 'campaign-return'],
    ]);
    expect(done.notices).toEqual([]);
  });

  it('hráč u tažení – výprava pokračuje', () => {
    const step = stepCampaign(live(), LAST + 400, LIVE, worldOf());
    expect(step.state.phase).toBe('marching');
    expect(step.state.absent).toBeUndefined();
  });

  it('se zástupcem vede NPC, po návratu hráč velení převezme', () => {
    const deputy = { villageId: 'lhota', personId: 2 };
    const away = stepCampaign(live(deputy), LAST + 1, SET_OUT, worldOf());
    expect(away.state.phase).toBe('marching');
    expect(away.state.absent).toBe(true);
    const back = stepCampaign(
      away.state,
      LAST + 10,
      [intent(LAST + 5, 1, { kind: 'presence' })],
      worldOf(),
    );
    expect(back.state.absent).toBeUndefined();
    expect(back.state.liveCommand).toBe(true);
  });

  it('padlý velitel → velí zástupce (NPC); bez zástupce rozpad', () => {
    const deputy = { villageId: 'lhota', personId: 2 };
    for (const [d, phase, liveCommand] of [
      [deputy, 'marching', false],
      [null, 'disbanded', true],
    ] as const) {
      const s = stepCampaign(live(d), LAUNCH + 50, LIVE, worldOf()).state;
      s.members[0]!.status = 'fallen';
      const next = stepCampaign(s, LAUNCH + 51, LIVE, worldOf()).state;
      expect(next.phase).toBe(phase);
      expect(next.liveCommand).toBe(liveCommand);
    }
  });
});
