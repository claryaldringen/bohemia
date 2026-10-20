import { SACRED_OAK_RADIUS_M, sacredEntrance } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneVillage } from '../../village-view';
import type { SceneWedding, SceneWeddingGuest } from '../../wedding-view';
import { LIVESTOCK_EPOCH_MS } from '../livestock-motion';
import { SHRINE_RING_M } from '../sacred-layout';
import { createVillagerPose, villagerSeconds } from '../villager-motion';
import {
  WEDDING_SITE_RADIUS_M,
  WEDDING_TIMING,
  oakGarland,
  pickWeddingSite,
  weddingActiveIn,
  weddingFire,
  weddingPhase,
  weddingPlan,
  weddingPose,
  weddingSiteCandidates,
  weddingVillagersIn,
  type WeddingEnv,
  type WeddingPlan,
} from '../wedding-plan';

// Svatba ve scéně (kinship.md – Svatba ve scéně; Martin – GitHub issue #2: „Jako máme pohřeb,
// udělej i svatbu. Svatebčané půjdou na některé z posvátných míst v okolí, kde budou oddáni.“) –
// čisté funkce času.

const DAY_MS = 86_000;
const START = LIVESTOCK_EPOCH_MS + 1_000_000_000;
const DAY = 500;
const windowOf = (day: number): { startMs: number; endMs: number } => ({
  startMs: START + (day - DAY) * DAY_MS,
  endMs: START + (day - DAY + 1) * DAY_MS,
});

/** Ves: dům nevěsty (1), ženicha (2) a soused (3); posvátný dub 60 m severně. */
const DWELLINGS: SceneVillage['dwellings'] = [
  { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
  { id: 2, type: 'zemnice', position: { x: 25, z: 0, rotation: 0 }, built: true, progress: 1 },
  { id: 3, type: 'zemnice', position: { x: -25, z: 0, rotation: 0 }, built: true, progress: 1 },
];
const OAK = { id: 900, x: 0, z: 60 };
const VILLAGE: SceneVillage = {
  dwellings: DWELLINGS,
  fields: [],
  sacred: { oaks: [OAK], groves: [], buildings: [] },
};
const guests = (n: number): SceneWeddingGuest[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 10 + i,
    sex: i % 2 ? 'female' : 'male',
    age: 8 + i * 6,
    home: [1, 2, 3][i % 3]!,
  }));
const WEDDING: SceneWedding = {
  key: `${DAY}:0`,
  day: DAY,
  bride: { id: 3, age: 19, from: 1 },
  groom: { id: 6, age: 23, from: 2 },
  home: 2,
  guests: guests(9),
};
/** Pěšiny: z každého bodu přes ohyb (x + 4) – trasa po pěšině není rovná čára. */
const ENV: WeddingEnv = {
  dayWindow: windowOf,
  door: (id) => {
    const d = DWELLINGS.find((w) => w.id === id);
    return d ? { x: d.position.x, z: d.position.z + 4 } : null;
  },
  route: (a, b) => [
    [a.x, a.z],
    [(a.x + b.x) / 2 + 4, (a.z + b.z) / 2],
    [b.x, b.z],
  ],
  standable: () => true,
  figureScale: 1.2,
  seed: 7,
};

function plan(
  wedding: SceneWedding = WEDDING,
  village: SceneVillage = VILLAGE,
  env: WeddingEnv = ENV,
): WeddingPlan {
  const p = weddingPlan(wedding, village, env);
  if (!p) throw new Error('bez plánu');
  return p;
}

/** Póza člověka `index` v okamžiku `nowMs` (žena, měřítko 1,2). */
function poseAt(
  p: WeddingPlan,
  index: number,
  nowMs: number,
): ReturnType<typeof createVillagerPose> {
  const pose = createVillagerPose();
  return weddingPose(p, index, 'woman', 1.2)(villagerSeconds(nowMs), [], pose);
}

describe('místo obřadu (weddingSiteCandidates, pickWeddingSite)', () => {
  const sacred: NonNullable<SceneVillage['sacred']> = {
    oaks: [
      { id: 1, x: 0, z: 50 },
      { id: 2, x: 0, z: 200, snag: true },
      { id: 3, x: 0, z: WEDDING_SITE_RADIUS_M + 10 },
    ],
    groves: [{ id: 4, x: 150, z: 0, squares: [{ cell: { x: 10, y: 0 }, x: 150, z: 0, size: 15 }] }],
    buildings: [
      { id: 5, kind: 'shrine', position: { x: -300, z: 0, rotation: 0 }, built: true, progress: 1 },
      { id: 6, kind: 'idol', position: { x: -80, z: 0, rotation: 0 }, built: false, progress: 0.4 },
      {
        id: 7,
        kind: 'idol',
        position: { x: 0, z: -90, rotation: 0 },
        built: true,
        progress: 1,
        abandoned: true,
      },
    ],
  };
  const village: SceneVillage = { dwellings: DWELLINGS, fields: [], sacred };

  it('jen stojící navštěvovaná modla a svatyně, živé duby a háje do 600 m – od nejbližšího', () => {
    const list = weddingSiteCandidates(village, { x: 0, z: 0 });
    expect(list.map((c) => `${c.kind}:${c.id}`)).toEqual(['oak:1', 'grove:4', 'shrine:5']);
    expect(list[0]!.distanceM).toBeCloseTo(50, 6);
  });

  it('nejbližší místo nejčastěji, ale ne vždy; bez míst null (náves)', () => {
    const list = weddingSiteCandidates(village, { x: 0, z: 0 });
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const site = pickWeddingSite(list, (i + 0.5) / 1000)!;
      counts.set(site.id, (counts.get(site.id) ?? 0) + 1);
    }
    expect(counts.get(1)!).toBeGreaterThan(counts.get(4)!);
    expect(counts.get(4)!).toBeGreaterThan(counts.get(5)!);
    expect(counts.get(4)!).toBeGreaterThan(0);
    expect(counts.get(5)!).toBeGreaterThan(0);
    expect(counts.get(1)! / 1000).toBeGreaterThan(0.6);
    expect(pickWeddingSite([], 0.3)).toBeNull();
  });
});

describe('plán svatby u posvátného dubu (weddingPlan)', () => {
  const p = plan();
  const brideIndex = p.members.findIndex((m) => m.role === 'bride');
  const groomIndex = p.members.findIndex((m) => m.role === 'groom');

  it('pár stojí na kraji koruny dubu ze strany od domu nevěsty, hledí ke kmeni', () => {
    expect(p.site.kind).toBe('oak');
    expect(p.site.id).toBe(OAK.id);
    expect(Math.hypot(p.site.couple.x - OAK.x, p.site.couple.z - OAK.z)).toBeCloseTo(
      SACRED_OAK_RADIUS_M,
      6,
    );
    expect(p.site.couple.z).toBeLessThan(OAK.z);
    expect(p.site.oak).toEqual({ x: OAK.x, z: OAK.z, growth: 1 });
    expect(p.site.fires).toEqual([]);
  });

  it('průvod jde od vchodu domu nevěsty po pěšině k páru; vpředu nevěsta a ženich', () => {
    const door = ENV.door(1)!;
    expect(p.village.path.points[0]).toEqual([door.x, door.z]);
    const last = p.village.path.points[p.village.path.points.length - 1]!;
    expect(last[0]).toBeCloseTo(p.site.couple.x, 6);
    expect(last[1]).toBeCloseTo(p.site.couple.z, 6);
    // pěšina s ohybem – trasa není rovná
    expect(p.village.path.points.some(([x]) => x > 3)).toBe(true);
    expect(p.members[brideIndex]!.behind).toBe(0);
    expect(p.members[groomIndex]!.behind).toBe(0);
    expect(p.members[brideIndex]!.side).toBeGreaterThan(0);
    expect(p.members[groomIndex]!.side).toBeLessThan(0);
    expect(p.members.filter((m) => m.role === 'guest')).toHaveLength(9);
    expect(p.outside).toBeNull();
  });

  it('časy jdou za sebou: scházení, průvod, podkova, obřad, pár k sobě, rozchod', () => {
    const t = p.timeline;
    expect(t.gatherMs).toBe(START);
    expect(t.departMs).toBe(START + WEDDING_TIMING.gatherS * 1000);
    expect(t.arriveMs).toBeGreaterThan(t.departMs);
    expect(t.ritesMs).toBeGreaterThan(t.arriveMs);
    expect(t.vowsMs).toBeGreaterThan(t.ritesMs);
    expect(t.endMs - t.ritesMs).toBe(WEDDING_TIMING.ritesS * 1000);
    expect(p.figuresUntilMs).toBeGreaterThan(t.endMs);
    expect(weddingPhase(p, START - 1)).toBe('before');
    expect(weddingPhase(p, START + 1000)).toBe('gathering');
    expect(weddingPhase(p, t.departMs + 1000)).toBe('procession');
    expect(weddingPhase(p, t.ritesMs + 1000)).toBe('rites');
    expect(weddingPhase(p, t.vowsMs + 1000)).toBe('vows');
    expect(weddingPhase(p, t.endMs + 1000)).toBe('home');
    expect(weddingPhase(p, p.figuresUntilMs + 1)).toBe('done');
    // u dubu oheň nehoří; věnec a pentle jen při obřadu
    expect(weddingFire(p, t.ritesMs)).toBe(0);
    expect(oakGarland(p, t.ritesMs)).toBe(true);
    expect(oakGarland(p, START)).toBe(false);
    expect(oakGarland(p, p.figuresUntilMs)).toBe(false);
  });

  it('nevěsta: před svatbou skrytá, v průvodu po trase, u dubu ke kmeni, pak k ženichovi', () => {
    expect(poseAt(p, brideIndex, START - 1000).hidden).toBe(true);
    const walking = poseAt(p, brideIndex, p.timeline.departMs + 8000);
    expect(walking.hidden).toBe(false);
    expect(walking.clip).toBe('walk');
    const rite = poseAt(p, brideIndex, p.timeline.ritesMs + 1000);
    expect(rite.clip).toBe('idle');
    const ring = p.members[brideIndex]!.ring;
    expect(rite.x).toBeCloseTo(ring.x, 6);
    expect(rite.z).toBeCloseTo(ring.z, 6);
    // hledí ke kmeni (na sever)
    expect(rite.headingZ).toBeGreaterThan(0.9);
    const vows = poseAt(p, brideIndex, p.timeline.vowsMs + 1000);
    const groomRing = p.members[groomIndex]!.ring;
    const toGroom = Math.atan2(groomRing.z - ring.z, groomRing.x - ring.x);
    expect(Math.atan2(vows.headingZ, vows.headingX)).toBeCloseTo(toGroom, 6);
  });

  it('svatebčané stojí v podkově kolem páru – strana ke kmeni zůstane volná', () => {
    const facing = { x: OAK.x - p.site.couple.x, z: OAK.z - p.site.couple.z };
    const l = Math.hypot(facing.x, facing.z);
    for (const m of p.members.filter((q) => q.role === 'guest')) {
      const d = { x: m.ring.x - p.site.couple.x, z: m.ring.z - p.site.couple.z };
      const r = Math.hypot(d.x, d.z);
      expect(r).toBeGreaterThan(2.5);
      const cos = (d.x * facing.x + d.z * facing.z) / (r * l);
      expect(cos).toBeLessThan(Math.cos((Math.PI * 54) / 180));
      const at = poseAt(p, p.members.indexOf(m), p.timeline.ritesMs + 1000);
      expect(at.x).toBeCloseTo(m.ring.x, 6);
      // hledí na pár
      const toCouple = Math.atan2(p.site.couple.z - m.ring.z, p.site.couple.x - m.ring.x);
      expect(Math.atan2(at.headingZ, at.headingX)).toBeCloseTo(toCouple, 6);
    }
  });

  it('po obřadu jde pár do nového domova a zmizí, svatebčané k vlastním domům', () => {
    const bride = p.members[brideIndex]!;
    const home = ENV.door(2)!;
    const end = bride.home.points[bride.home.points.length - 1]!;
    expect(end[0]).toBeCloseTo(home.x, 6);
    expect(end[1]).toBeCloseTo(home.z, 6);
    expect(bride.procession).toBe(true);
    expect(p.members[groomIndex]!.home.points.at(-1)).toEqual(bride.home.points.at(-1));
    const away = poseAt(p, brideIndex, bride.leaveMs + 2000);
    expect(away.clip).toBe('walk');
    expect(poseAt(p, brideIndex, p.figuresUntilMs).hidden).toBe(true);
    // soused jde k sobě, domácnost nového domova za párem
    const neighbour = p.members.find((m) => m.role === 'guest' && m.person === 12)!;
    expect(neighbour.home.points.at(-1)).toEqual([ENV.door(3)!.x, ENV.door(3)!.z]);
    expect(neighbour.procession).toBe(false);
    const follower = p.members.find((m) => m.role === 'guest' && m.person === 11)!;
    expect(follower.procession).toBe(true);
    expect(follower.leaveMs).toBeGreaterThan(bride.leaveMs);
  });

  it('determinismus: stejný plán ze stejných dat, póza je čistá funkce času', () => {
    const again = plan();
    expect(JSON.stringify(again)).toBe(JSON.stringify(p));
    const at = p.timeline.departMs + 12_345;
    const a = poseAt(p, 4, at);
    poseAt(p, 4, at + 50_000);
    expect(poseAt(p, 4, at)).toEqual(a);
    expect(poseAt(again, 4, at)).toEqual(a);
  });

  it('lidé svatby ubírají z pracujících postav jen ve dnech, kdy jsou vidět', () => {
    expect(weddingActiveIn(p, windowOf(DAY))).toBe(true);
    expect(weddingActiveIn(p, windowOf(DAY - 1))).toBe(false);
    expect(weddingVillagersIn(p, windowOf(DAY))).toBe(p.members.length);
    expect(weddingVillagersIn(p, windowOf(DAY + 60))).toBe(0);
    expect(weddingVillagersIn(p, null)).toBe(0);
  });
});

describe('svatba ve svatyni a na návsi', () => {
  const shrine = {
    id: 40,
    kind: 'shrine' as const,
    position: { x: 0, z: 90, rotation: Math.PI },
    built: true,
    progress: 1,
  };
  const village: SceneVillage = {
    dwellings: DWELLINGS,
    fields: [],
    sacred: { oaks: [], groves: [], buildings: [shrine] },
  };

  it('svatyně: průvod vstupem přes příkop, pár před modlou, svatebčané jen na ploše, dvě ohniště u vstupu hoří', () => {
    const p = plan(WEDDING, village);
    expect(p.site.kind).toBe('shrine');
    const entrance = sacredEntrance(shrine);
    // vstup je na trase
    expect(
      p.village.path.points.some(([x, z]) => Math.hypot(x - entrance.x, z - entrance.z) < 1e-6),
    ).toBe(true);
    for (const m of p.members.filter((q) => q.role === 'guest')) {
      const r = Math.hypot(m.ring.x - shrine.position.x, m.ring.z - shrine.position.z);
      expect(r).toBeLessThan(SHRINE_RING_M.inner);
      expect(r).toBeGreaterThan(2.5);
    }
    expect(p.site.fires).toHaveLength(2);
    for (const f of p.site.fires) {
      // ohniště na straně vstupu (k vsi – na jih)
      expect(f.z).toBeLessThan(shrine.position.z);
    }
    expect(weddingFire(p, p.timeline.ritesMs + 5000)).toBeGreaterThan(0.9);
    expect(weddingFire(p, p.figuresUntilMs)).toBe(0);
    expect(oakGarland(p, p.timeline.ritesMs)).toBe(false);
  });

  it('bez posvátného místa: ohniště na návsi před domem nevěsty', () => {
    const p = plan(WEDDING, { dwellings: DWELLINGS, fields: [] });
    expect(p.site.kind).toBe('green');
    expect(p.site.fires).toHaveLength(1);
    const fire = p.site.fires[0]!;
    const door = ENV.door(1)!;
    expect(Math.hypot(fire.x - door.x, fire.z - door.z)).toBeCloseTo(7, 6);
    expect(Math.hypot(p.site.couple.x - fire.x, p.site.couple.z - fire.z)).toBeLessThan(2.5);
    expect(weddingFire(p, p.timeline.ritesMs + 5000)).toBeGreaterThan(0.9);
  });

  it('místo dál než 600 m se nevybere – náves', () => {
    const far = { ...shrine, position: { x: 0, z: 700, rotation: 0 } };
    const p = plan(WEDDING, { ...village, sacred: { oaks: [], groves: [], buildings: [far] } });
    expect(p.site.kind).toBe('green');
  });
});

describe('nevěsta z okolí', () => {
  const EDGE = { x: 900, z: 0 };
  const wedding: SceneWedding = {
    ...WEDDING,
    bride: { age: 19, from: null, outside: { direction: 'E', edge: EDGE } },
    groom: { id: 6, age: 23, from: 2 },
    home: 2,
    guests: guests(6),
    companions: [
      { sex: 'male', age: 48 },
      { sex: 'female', age: 44 },
      { sex: 'male', age: 16 },
    ],
  };
  const p = plan(wedding);
  const bride = p.members.find((m) => m.role === 'bride')!;
  const brideIndex = p.members.indexOf(bride);

  it('přijde se svými lidmi od kraje mapy; průvod ze vsi od domu ženicha – dojdou naráz', () => {
    expect(p.outside).not.toBeNull();
    expect(p.outside!.path.points[0]).toEqual([EDGE.x, EDGE.z]);
    expect(bride.party).toBe('outside');
    expect(p.members.filter((m) => m.role === 'companion')).toHaveLength(3);
    expect(p.village.path.points[0]).toEqual([ENV.door(2)!.x, ENV.door(2)!.z]);
    // průvod ze vsi vyjde později, ať dojdou spolu
    expect(p.timeline.departMs).toBeGreaterThan(START + WEDDING_TIMING.gatherS * 1000);
    expect(Math.abs(p.timeline.arriveMs - p.timeline.outsideArriveMs!)).toBeLessThan(2);
    expect(weddingPhase(p, START + 60_000)).toBe('coming');
    // ze vsi nikdo není vidět, dokud se průvod neschází
    const guest = p.members.findIndex((m) => m.role === 'guest');
    expect(poseAt(p, guest, START + 60_000).hidden).toBe(true);
    // nevěsta jde od kraje hned
    const coming = poseAt(p, brideIndex, START + 60_000);
    expect(coming.hidden).toBe(false);
    expect(coming.x).toBeLessThan(EDGE.x);
    // lidé z okolí ves nepočítá mezi pracujícími
    expect(weddingVillagersIn(p, windowOf(DAY + 3))).toBeLessThanOrEqual(7);
  });

  it('po obřadu jde nevěsta do nového domova, lidé z okolí zpátky ke kraji a zmizí', () => {
    const home = ENV.door(2)!;
    expect(bride.home.points.at(-1)).toEqual([home.x, home.z]);
    for (const m of p.members.filter((q) => q.role === 'companion')) {
      expect(m.home.points.at(-1)).toEqual([EDGE.x, EDGE.z]);
      const i = p.members.indexOf(m);
      expect(poseAt(p, i, p.figuresUntilMs).hidden).toBe(true);
    }
  });

  it('po zemské stezce, když je ve směru, odkud přišla', () => {
    const trail = {
      id: 1,
      direction: 'E' as const,
      built: true,
      points: [
        { x: 30, z: -5 },
        { x: 400, z: -40 },
        { x: 905, z: -60 },
      ],
    };
    const q = plan(wedding, { ...VILLAGE, trails: [trail] });
    expect(q.outside!.path.points[0]).toEqual([905, -60]);
    expect(q.outside!.path.points[1]).toEqual([400, -40]);
  });
});

describe('starší události a zaniklé domy', () => {
  it('dům nevěsty ve scéně není – průvod vyjde od obydlí nejblíž k místu obřadu', () => {
    const wedding: SceneWedding = { ...WEDDING, bride: { age: 19, from: 77 }, home: 78 };
    const dwellings: SceneVillage['dwellings'] = [
      ...DWELLINGS,
      { id: 4, type: 'zemnice', position: { x: 5, z: 40, rotation: 0 }, built: true, progress: 1 },
    ];
    const p = plan(
      wedding,
      { ...VILLAGE, dwellings },
      {
        ...ENV,
        door: (id) => {
          const d = dwellings.find((w) => w.id === id);
          return d ? { x: d.position.x, z: d.position.z + 4 } : null;
        },
      },
    );
    // dům 4 je nejblíž dubu (0, 60)
    expect(p.village.path.points[0]).toEqual([5, 44]);
    const bride = p.members.find((m) => m.role === 'bride')!;
    expect(bride.home.points.at(-1)).toEqual([5, 44]);
  });

  it('bez hodin světa nebo bez obydlí plán není', () => {
    expect(weddingPlan(WEDDING, VILLAGE, { ...ENV, dayWindow: () => null })).toBeNull();
    expect(weddingPlan(WEDDING, { ...VILLAGE, dwellings: [] }, ENV)).toBeNull();
  });
});
