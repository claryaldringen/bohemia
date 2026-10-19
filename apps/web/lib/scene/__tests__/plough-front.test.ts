import { rotationCosSin } from '@bohemia/game';
import { describe, expect, it } from 'vitest';
import type { SceneFieldPart, SceneLaborShare, SceneVillage } from '../../village-view';
import { workAt, workFrame } from '../field-look';
import {
  FRONT_STRIP_M,
  MIN_STRIP_M,
  frontStrip,
  ploughFront,
  ploughTeamCount,
  ploughedTo,
  stripRows,
  type PloughAssignment,
} from '../plough-front';
import {
  TEAM_SCALE,
  TEAM_SPEED_M_S,
  TRANSIT_SPEED_M_S,
  createTeamPose,
  ploughPath,
  teamPose,
  teamSpot,
  teamTrack,
  trackPose,
  transitTrack,
  type TeamPose,
  type TeamTrack,
} from '../plough-team';

// Kde orá spřežení (oxen.md – Spřežení postupuje s orbou): pruh u čáry práce na čele orby,
// další den nové čelo, víc spřežení bez srážek, natočené pole.

const CELL = 15;
type Part = SceneFieldPart;

const part = (id: number, x: number, z: number, extra: Partial<Part> = {}): Part => ({
  id,
  cell: { x: Math.floor(x / CELL), y: Math.floor(z / CELL) },
  x,
  z,
  size: CELL,
  stage: 'sown',
  look: 'stubble',
  ...extra,
});

const pen = (id: number, oxen: number): NonNullable<SceneVillage['pens']>[number] => ({
  id,
  cell: { x: id, y: 9 },
  x: id * CELL + 7.5,
  z: 142.5,
  size: CELL,
  built: true,
  progress: 1,
  oxen,
  trainees: 0,
  cows: 0,
});

/** Ves s domem v (0, 0) a polem po řadě dílů podél x (z = 7,5) – práce jde od vsi do +z. */
function village(
  parts: Part[],
  share: Partial<SceneLaborShare> = {},
  pens: NonNullable<SceneVillage['pens']> = [],
): SceneVillage {
  return {
    dwellings: [
      { id: 1, type: 'zemnice', position: { x: 0, z: 0, rotation: 0 }, built: true, progress: 1 },
    ],
    fields: [{ id: 5, parts }],
    pens,
    labor: {
      day: 250,
      month: 9,
      people: { children: 0, adults: 4, elders: 0 },
      shares: [
        {
          activity: 'plough',
          target: { kind: 'field', id: 5 },
          manDays: 2,
          ...share,
        },
      ],
    },
  };
}

/** Řada dílů 51… podél x od x = 37,5. */
const row = (count: number, look: (i: number) => Partial<Part> = () => ({})): Part[] =>
  Array.from({ length: count }, (_, i) => part(51 + i, 37.5 + i * CELL, 7.5, look(i)));

/** Projde čas a zavolá `fn` s pózou spřežení. */
function sample(
  track: TeamTrack,
  from: number,
  to: number,
  dt: number,
  fn: (p: TeamPose, t: number) => void,
): void {
  const pose = createTeamPose();
  for (let t = from; t < to; t += dt) fn(trackPose(track, t, pose), t);
}

/** Tělo spřežení jako kruhy (m, ve scéně): voli po délce, rádlo, oráč, honáček. */
function bodies(p: TeamPose): { x: number; z: number; r: number }[] {
  const k = TEAM_SCALE;
  const out: { x: number; z: number; r: number }[] = [];
  for (const ox of p.oxen) {
    for (const along of [-0.8, 0, 0.8]) {
      out.push({ x: ox.x + ox.hx * along * k, z: ox.z + ox.hz * along * k, r: 0.42 * k });
    }
  }
  const { ard } = p;
  out.push({ x: ard.x, z: ard.z, r: 0.2 * k });
  out.push({ x: ard.x + ard.fx * 0.8 * k, z: ard.z + ard.fz * 0.8 * k, r: 0.2 * k });
  out.push({ x: p.plowman.x, z: p.plowman.z, r: 0.3 * k });
  out.push({ x: p.boy.x, z: p.boy.z, r: 0.25 * k });
  return out;
}

describe('plough-front – pruh u čáry práce', () => {
  it('kam orba na dílu došla: po pruzích obtisku, zoraný celý, nezoraný nic', () => {
    expect(ploughedTo({ look: 'plowed', work: 0.5 })).toBe(0.5);
    expect(ploughedTo({ look: 'plowed', work: 0.3 })).toBe(0.25);
    expect(ploughedTo({ look: 'plowed', work: null })).toBe(1);
    expect(ploughedTo({ look: 'stubble', work: null })).toBe(0);
    expect(ploughedTo({ look: null, work: null })).toBe(0);
    // osetý díl je zoraný celý
    expect(ploughedTo({ look: 'sown', work: 0.4 })).toBe(1);
  });

  it('pruh končí na čáře práce, nejvýš 4 řady zpět, aspoň dvě řady', () => {
    expect(frontStrip(0.5, CELL)).toEqual({ lo: 0, hi: 7.5 });
    expect(frontStrip(1, CELL)).toEqual({ lo: CELL - FRONT_STRIP_M, hi: CELL });
    expect(frontStrip(0, CELL)).toEqual({ lo: 0, hi: MIN_STRIP_M });
    expect(stripRows(10)).toBe(4);
    expect(stripRows(3.75)).toBe(2);
    expect(stripRows(1)).toBe(2);
  });

  it('spřežení orá rozpracovaný díl čela přesně v jeho zorané části (jako obtisk)', () => {
    const parts = row(3, (i) =>
      i < 2 ? { look: 'plowed' } : { look: 'plowed', work: 0.5, before: 'stubble' },
    );
    const v = village(parts, { parts: [52, 53] });
    const [team, ...rest] = ploughFront(v);
    expect(rest).toEqual([]);
    expect(team!.partId).toBe(53);
    expect(team!.field).toMatchObject({ dirX: 1, dirZ: 0, from: -7.5, to: 0, rows: 4 });
    expect(team!.field.acrossX).toBeCloseTo(0, 9);
    expect(team!.field.acrossZ).toBe(1);
    // radlice v zemi jen v zorané části dílu – mezi stranou u vsi a čárou práce
    const frame = workFrame(parts[2]!, [1, 0], { x: 0, z: 0 });
    const path = ploughPath(team!.field);
    let ploughing = 0;
    sample(teamTrack(path), 0, path.length / TEAM_SPEED_M_S, 0.25, (p) => {
      if (p.lift > 0) return;
      ploughing++;
      const w = workAt(frame, parts[2]!, p.ard.x, p.ard.z);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.ard.x - parts[2]!.x)).toBeLessThanOrEqual(CELL / 2 + 0.6);
    });
    expect(ploughing).toBeGreaterThan(100);
  });

  it('práce jde od vsi pryč – díl na druhé straně vsi orá od své strany u vsi', () => {
    const parts = [part(51, 37.5, -7.5, { look: 'plowed', work: 0.25, before: 'stubble' })];
    const [team] = ploughFront(village(parts, { parts: [51] }));
    // ves je na +z od dílu – pruh u strany +z (napříč řadami do −z)
    expect(team!.field.acrossZ).toBe(-1);
    const frame = workFrame(parts[0]!, [1, 0], { x: 0, z: 0 });
    const path = ploughPath(team!.field);
    sample(teamTrack(path), 0, path.length / TEAM_SPEED_M_S, 0.5, (p) => {
      if (p.lift > 0) return;
      const w = workAt(frame, parts[0]!, p.ard.x, p.ard.z);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(MIN_STRIP_M / CELL);
      expect(p.ard.z).toBeGreaterThan(-MIN_STRIP_M - 0.6);
    });
  });

  it('bez orby dne nikdo neorá; bez fronty od jádra podle vzhledu dílů (odhad)', () => {
    const parts = row(3, (i) =>
      i === 0 ? { look: 'plowed' } : i === 1 ? { look: 'plowed', work: 0.75 } : {},
    );
    const idle = village(parts);
    expect(ploughFront({ ...idle, labor: { ...idle.labor!, shares: [] } })).toEqual([]);
    const [team] = ploughFront(village(parts));
    expect(team!.partId).toBe(52);
    expect(team!.field.to).toBeCloseTo(0.75 * CELL - CELL / 2, 9);
  });
});

describe('plough-front – postup po dnech', () => {
  it('další den spřežení dojde z pruhu včerejšího čela na nové čelo bez skoku', () => {
    // včera čelo na 52 (3/4), dnes orba přešla na 53 (1/4)
    const yesterday = village(
      row(3, (i) => (i === 0 ? { look: 'plowed' } : i === 1 ? { look: 'plowed', work: 0.75 } : {})),
      { parts: [52] },
    );
    const today = village(
      row(3, (i) => (i < 2 ? { look: 'plowed' } : { look: 'plowed', work: 0.25 })),
      { parts: [52, 53] },
    );
    const [a] = ploughFront(yesterday);
    const [b] = ploughFront(today);
    expect(a!.partId).toBe(52);
    expect(b!.partId).toBe(53);
    expect(b!.field).toMatchObject({ from: -7.5, to: -7.5 + MIN_STRIP_M });

    const old = teamTrack(ploughPath(a!.field));
    const t0 = 1000;
    const before = trackPose(old, t0, createTeamPose());
    const next = transitTrack(ploughPath(b!.field), teamSpot(before), t0);
    expect(next.transit).not.toBeNull();
    const transit = next.transit!;
    // na začátku stojí, kde bylo, v cíli je na nové dráze
    const start = trackPose(next, t0, createTeamPose());
    expect(start.yoke.x).toBeCloseTo(before.yoke.x, 9);
    expect(start.yoke.z).toBeCloseTo(before.yoke.z, 9);
    const end = trackPose(next, transit.arriveS - 1e-6, createTeamPose());
    const onPath = teamPose(next.path, transit.arriveS, createTeamPose());
    expect(Math.hypot(end.yoke.x - onPath.yoke.x, end.yoke.z - onPath.yoke.z)).toBeLessThan(1e-3);
    // jde krokem (ne rychleji než při přechodu) a uprostřed nese rádlo nahoře
    let last = start.yoke;
    sample(next, t0, transit.arriveS + 10, 0.1, (p, t) => {
      expect(Math.hypot(p.yoke.x - last.x, p.yoke.z - last.z)).toBeLessThanOrEqual(
        Math.max(TRANSIT_SPEED_M_S, TEAM_SPEED_M_S) * 0.1 * 1.05 + 1e-6,
      );
      last = { ...p.yoke };
      if (Math.abs(t - (t0 + transit.arriveS) / 2) < 0.1) expect(p.lift).toBe(1);
    });
  });
});

describe('plough-front – víc spřežení', () => {
  /** Nejmenší mezera mezi těly dvou spřežení za `seconds` s (záporná = srazila se). */
  function closest(a: PloughAssignment, b: PloughAssignment, seconds: number): number {
    const ta = teamTrack(ploughPath(a.field));
    const tb = teamTrack(ploughPath(b.field));
    const pa = createTeamPose();
    const pb = createTeamPose();
    let best = Infinity;
    for (let t = 0; t < seconds; t += 0.25) {
      trackPose(ta, t, pa);
      trackPose(tb, t, pb);
      for (const x of bodies(pa)) {
        for (const y of bodies(pb)) {
          best = Math.min(best, Math.hypot(x.x - y.x, x.z - y.z) - x.r - y.r);
        }
      }
    }
    return best;
  }

  it('dvě spřežení na různých dílech dnešní fronty – dráhy ani souvratě se nepotkají', () => {
    const parts = row(10, (i) =>
      i < 9 ? { look: 'plowed' } : { look: 'plowed', work: 0.5, before: 'stubble' },
    );
    const v = village(parts, { parts: parts.map((p) => p.id!) }, [pen(1, 2), pen(2, 2)]);
    expect(ploughTeamCount(v)).toBe(2);
    const teams = ploughFront(v);
    expect(teams).toHaveLength(2);
    expect(teams[0]!.partId).toBe(60);
    expect(teams[1]!.partId).not.toBe(60);
    // dráhy jsou různě dlouhé – za dlouhou dobu se vystřídají všechny vzájemné polohy
    expect(closest(teams[0]!, teams[1]!, 900)).toBeGreaterThan(3);
  });

  it('jediný díl fronty: dvě spřežení ve dvou pruzích vedle sebe v zákrytu, třetí zůstane doma', () => {
    const parts = row(2, (i) =>
      i === 0 ? { look: 'plowed' } : { look: 'plowed', work: 0.375, before: 'stubble' },
    );
    const v = village(parts, { parts: [52] }, [pen(1, 2), pen(2, 2), pen(3, 2)]);
    const teams = ploughFront(v);
    expect(teams).toHaveLength(2);
    expect(teams.map((t) => t.partId)).toEqual([52, 52]);
    const [a, b] = teams.map((t) => t.field);
    // pruhy stejně široké, navazují na sebe, stejné řady – stejná dráha posunutá napříč
    expect(a!.to).toBeCloseTo(b!.from!, 9);
    expect(a!.to! - a!.from!).toBeCloseTo(b!.to! - b!.from!, 9);
    expect(a!.rows).toBe(b!.rows);
    expect(ploughPath(a!).length).toBeCloseTo(ploughPath(b!).length, 9);
    // na souvrati jde jedno za druhým – nikdy se nedotknou
    expect(closest(teams[0]!, teams[1]!, 300)).toBeGreaterThan(0.25);
  });
});

describe('plough-front – natočené pole', () => {
  it('dráha v osách natočeného čtverce, radlice jen v pruhu dílu', () => {
    const rotation = Math.PI / 6;
    const [c, s] = rotationCosSin(rotation);
    // mřížka pole natočená o 30°: osa x mřížky ve světě (c, −s), osa y (s, c)
    const center = (i: number): { x: number; z: number } => ({
      x: 40 + i * CELL * c,
      z: 30 - i * CELL * s,
    });
    const parts = [0, 1, 2].map((i): Part => ({
      ...part(51 + i, center(i).x, center(i).z, {
        look: i < 2 ? 'plowed' : 'plowed',
        ...(i === 2 ? { work: 0.625, before: 'stubble' as const } : {}),
      }),
      cell: { x: i, y: 0 },
      rotation,
    }));
    const [team] = ploughFront(village(parts, { parts: [53] }));
    expect(team!.partId).toBe(53);
    // řady podél osy x mřížky (delší strana pole)
    expect(team!.field.dirX).toBeCloseTo(c, 9);
    expect(team!.field.dirZ).toBeCloseTo(-s, 9);
    const square = parts[2]!;
    const frame = workFrame(square, [c, -s], { x: 0, z: 0 });
    const path = ploughPath(team!.field);
    let ploughing = 0;
    sample(teamTrack(path), 0, path.length / TEAM_SPEED_M_S, 0.25, (p) => {
      if (p.lift > 0) return;
      ploughing++;
      // v osách čtverce uvnitř (podél řad) a v zorané části (napříč)
      const u = (p.ard.x - square.x) * c - (p.ard.z - square.z) * s;
      expect(Math.abs(u)).toBeLessThanOrEqual(CELL / 2 + 0.6);
      const w = workAt(frame, square, p.ard.x, p.ard.z);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(0.625);
    });
    expect(ploughing).toBeGreaterThan(100);
  });
});
