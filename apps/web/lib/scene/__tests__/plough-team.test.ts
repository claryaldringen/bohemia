import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TEAM_PARTS,
  TEAM_SCALE,
  TEAM_SPEED_M_S,
  TRANSIT_M,
  TRANSIT_SPEED_M_S,
  TURN_RADIUS_M,
  ardReach,
  createTeamPose,
  pathAt,
  ploughPath,
  teamPose,
  teamSpot,
  trackPose,
  transitTrack,
  writePartMatrix,
  writeSegmentMatrix,
  type PathPoint,
  type PloughField,
  type TeamPose,
} from '../plough-team';

const FIELD: PloughField = { x: 100, z: 25, size: 15, dirX: 1, dirZ: 0, rows: 4 };
const point = (): PathPoint => ({ x: 0, z: 0, hx: 0, hz: 1 });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

/** Projde celou smyčku spřežení po krocích `dt` (s). */
function loop(
  path: ReturnType<typeof ploughPath>,
  dt: number,
  fn: (p: TeamPose, t: number) => void,
): void {
  const pose = createTeamPose();
  const period = path.length / TEAM_SPEED_M_S;
  for (let t = 0; t < period; t += dt) fn(teamPose(path, t, pose), t);
}

describe('plough-team – dráha spřežení po poli', () => {
  for (const [label, field] of [
    ['řady daleko od sebe (půlkruh)', { ...FIELD, rows: 2 }],
    ['řady blízko (kapka ze tří oblouků)', FIELD],
    ['šikmé pole', { ...FIELD, dirX: 0.6, dirZ: -0.8, rows: 6 }],
    [
      'pruh čtverce, řady přibývají na druhou stranu',
      { ...FIELD, rows: 2, from: -4, to: 1, acrossX: 0, acrossZ: -1 },
    ],
  ] as const) {
    it(`${label}: uzavřená, spojitá dráha bez zlomů`, () => {
      const path = ploughPath(field);
      const a = point();
      const b = point();
      const step = 0.05;
      for (let s = 0; s < path.length; s += step) {
        pathAt(path, s, a);
        pathAt(path, s + step, b);
        // poloha se mění plynule (nejvýš o krok) a směr je jednotkový
        expect(dist(a, b)).toBeLessThanOrEqual(step + 1e-6);
        expect(Math.hypot(a.hx, a.hz)).toBeCloseTo(1, 6);
        // směr se mění nejvýš tak, jak dovolí poloměr obratu
        const turn = Math.acos(Math.min(1, a.hx * b.hx + a.hz * b.hz));
        expect(turn).toBeLessThanOrEqual(step / TURN_RADIUS_M + 1e-6);
      }
      // dráha je uzavřená – konec navazuje na začátek
      pathAt(path, 0, a);
      pathAt(path, path.length - 1e-9, b);
      expect(dist(a, b)).toBeLessThan(1e-6);
      expect(a.hx * b.hx + a.hz * b.hz).toBeCloseTo(1, 6);
    });
  }

  it('řady pokryjí čtverec pole: sudý počet řad tam a zpět, napříč rovnoměrně', () => {
    const path = ploughPath({ ...FIELD, rows: 5 });
    expect(path.field.rows).toBe(6);
    const rows = path.segments.filter((s) => s.kind === 'line' && Math.abs(s.dz) < 1e-9);
    expect(rows).toHaveLength(6);
    const offsets = rows.map((r) => (r.kind === 'line' ? r.z : 0));
    expect(Math.min(...offsets)).toBeCloseTo(FIELD.z - FIELD.size / 2 + FIELD.size / 12);
    expect(Math.max(...offsets)).toBeCloseTo(FIELD.z + FIELD.size / 2 - FIELD.size / 12);
    // řada jde tak daleko za okraj, aby radlice (o ardReach za jhem) dojela k okraji
    for (const r of rows) expect(r.length).toBeCloseTo(FIELD.size + 2 * ardReach());
  });

  it('pruh čtverce: řady jen mezi from a to, od from dál ve směru napříč', () => {
    const strip: PloughField = { ...FIELD, rows: 4, from: -2, to: 6, acrossX: 0, acrossZ: -1 };
    const path = ploughPath(strip);
    const rows = path.segments.filter((s) => s.kind === 'line' && Math.abs(s.dz) < 1e-9);
    expect(rows).toHaveLength(4);
    // napříč = −z: řady v z od 25 + 2 (from) k 25 − 6 (to), první u from
    const offsets = rows.map((r) => (r.kind === 'line' ? r.z : 0));
    expect(offsets[0]).toBeCloseTo(FIELD.z + 2 - 1, 9);
    expect(offsets[3]).toBeCloseTo(FIELD.z - 6 + 1, 9);
    for (const r of rows) expect(r.length).toBeCloseTo(FIELD.size + 2 * ardReach());
  });

  it('bod dráhy se opakuje po délce smyčky', () => {
    const path = ploughPath(FIELD);
    const a = pathAt(path, 12.3, point());
    const b = pathAt(path, 12.3 + 2 * path.length, point());
    const c = pathAt(path, 12.3 - path.length, point());
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(c.z).toBeCloseTo(a.z, 9);
  });
});

describe('plough-team – póza spřežení', () => {
  const k = TEAM_SCALE;
  const p = TEAM_PARTS;

  it('jho jede rychlostí spřežení a voli jdou vedle sebe pod ním', () => {
    const path = ploughPath(FIELD);
    const a = teamPose(path, 3, createTeamPose());
    const b = teamPose(path, 4, createTeamPose());
    expect(dist(a.yoke, b.yoke)).toBeCloseTo(TEAM_SPEED_M_S, 6);
    expect(dist(a.oxen[0], a.oxen[1])).toBeCloseTo(2 * p.oxSpan * k, 6);
    expect(a.yoke.y).toBeCloseTo(p.yokeY * k, 1);
  });

  it('stejný čas = stejná póza (čistá funkce času)', () => {
    const path = ploughPath(FIELD);
    const a = teamPose(path, 77.7, createTeamPose());
    const b = teamPose(path, 5, createTeamPose());
    teamPose(path, 77.7, b);
    expect(b).toEqual(a);
  });

  it('oj má v celé smyčce stálou délku a vede od hřídele rádla ke jhu', () => {
    const path = ploughPath(FIELD);
    loop(path, 0.5, (pose) => {
      const { pole } = pose;
      const len = Math.hypot(pole.bx - pole.ax, pole.by - pole.ay, pole.bz - pole.az);
      expect(Math.abs(len / (p.poleM * k) - 1)).toBeLessThan(0.08);
      expect(pole.bx).toBeCloseTo(pose.yoke.x, 9);
    });
  });

  it('oráč drží rukojeť rádla: dlaně u rukojeti v celé smyčce', () => {
    const path = ploughPath(FIELD);
    loop(path, 0.5, (pose) => {
      const { ard, plowman: pl } = pose;
      const grip = {
        x: ard.x + (ard.fx * p.ardGrip.z + ard.ux * p.ardGrip.y) * k,
        y: ard.y + (ard.fy * p.ardGrip.z + ard.uy * p.ardGrip.y) * k,
        z: ard.z + (ard.fz * p.ardGrip.z + ard.uz * p.ardGrip.y) * k,
      };
      const palm = {
        x: pl.x + pl.hx * p.plowmanPalm.z * k,
        y: pl.y + p.plowmanPalm.y * k,
        z: pl.z + pl.hz * p.plowmanPalm.z * k,
      };
      expect(Math.hypot(grip.x - palm.x, grip.y - palm.y, grip.z - palm.z)).toBeLessThan(0.06);
    });
  });

  it('rádlo i oráč jdou za voly – nikdy do nich nevrazí', () => {
    const path = ploughPath(FIELD);
    loop(path, 0.25, (pose) => {
      for (const ox of pose.oxen) {
        // vůl je ≈ 2,2 m dlouhý (× TEAM_SCALE) – počátek uprostřed
        expect(dist(ox, pose.ard)).toBeGreaterThan(1.3 * k);
        expect(dist(ox, pose.plowman)).toBeGreaterThan(2 * k);
        expect(dist(ox, pose.boy)).toBeGreaterThan(0.5 * k);
      }
    });
  });

  it('v řadě radlice v zemi, na souvrati rádlo nahoře; kymácí se jen při orbě', () => {
    const path = ploughPath(FIELD);
    let ploughing = 0;
    let lifted = 0;
    const tilts: number[] = [];
    loop(path, 0.25, (pose) => {
      const { ard } = pose;
      const u = ard.x - FIELD.x;
      const v = ard.z - FIELD.z;
      const inside = Math.max(Math.abs(u), Math.abs(v)) < FIELD.size / 2 - 0.5;
      if (inside) {
        ploughing++;
        expect(pose.lift).toBe(0);
        tilts.push(Math.asin(ard.fy));
      }
      if (Math.max(Math.abs(u), Math.abs(v)) > FIELD.size / 2 + 1.5) {
        lifted++;
        expect(pose.lift).toBe(1);
        // předek nahoru – radlice ze země
        expect(ard.fy).toBeGreaterThan(Math.sin((7 * Math.PI) / 180));
      }
    });
    expect(ploughing).toBeGreaterThan(50);
    expect(lifted).toBeGreaterThan(20);
    // při orbě se rádlo drobně kymácí (pár stupňů), nestojí strnule
    expect(Math.max(...tilts) - Math.min(...tilts)).toBeGreaterThan((1.5 * Math.PI) / 180);
    expect(Math.max(...tilts.map(Math.abs))).toBeLessThan((3 * Math.PI) / 180);
  });

  it('na rovné řadě je rádlo přesně za jhem a oráč za rádlem', () => {
    const path = ploughPath(FIELD);
    // první řada jde +x, jho začíná daleko za okrajem – za pár sekund je celé spřežení v řadě
    const pose = teamPose(path, 10, createTeamPose());
    expect(pose.plowman.z).toBeCloseTo(pose.yoke.z, 6);
    expect(pose.ard.z).toBeCloseTo(pose.yoke.z, 1);
    expect(pose.yoke.x - pose.ard.x).toBeCloseTo(ardReach(), 1);
    expect(pose.plowman.hx).toBeCloseTo(1, 6);
    expect(pose.ard.x - pose.plowman.x).toBeCloseTo((p.plowmanPalm.z - p.ardGrip.z) * k, 1);
    // honáček vlevo od levého vola – jede se +x, vpravo je (hz, −hx) = −z, vlevo +z
    expect(pose.boy.z).toBeGreaterThan(pose.oxen[0].z);
    expect(pose.oxen[0].z).toBeGreaterThan(pose.oxen[1].z);
  });
});

describe('plough-team – matice instancí', () => {
  it('pevný díl: osy vpravo, nahoru, vpřed a posun', () => {
    const m = new Float32Array(16);
    writePartMatrix(m, 0, { x: 1, y: 2, z: 3, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 }, 2);
    expect([...m]).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 2, 3, 1]);
  });

  it('tyč natažená z bodu a do bodu b (model délky L podél +z)', () => {
    const m = new Float32Array(16);
    const seg = { ax: 1, ay: 1, az: 0, bx: 1, by: 2, bz: 2 };
    writeSegmentMatrix(m, 0, seg, 1.3, 1.2);
    // konec modelu (0, 0, L) → b; průřez zvětšený 1,2×
    const L = 1.3;
    expect(m[8]! * L + m[12]!).toBeCloseTo(seg.bx, 5);
    expect(m[9]! * L + m[13]!).toBeCloseTo(seg.by, 5);
    expect(m[10]! * L + m[14]!).toBeCloseTo(seg.bz, 5);
    expect(Math.hypot(m[0]!, m[1]!, m[2]!)).toBeCloseTo(1.2, 5);
    expect(Math.hypot(m[4]!, m[5]!, m[6]!)).toBeCloseTo(1.2, 5);
  });
});

describe('plough-team – rozměry sedí s modely (tools/blender)', () => {
  it('rádlo, jho a oj z plough.py', () => {
    const py = readFileSync(
      new URL('../../../../../tools/blender/plough.py', import.meta.url),
      'utf8',
    );
    const pair = (name: string): number[] =>
      py
        .match(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm'))![1]!
        .split(',')
        .map(Number);
    const one = (name: string): number =>
      Number(py.match(new RegExp(`^${name} = ([0-9.]+)`, 'm'))![1]);
    expect(pair('ARD_HITCH')).toEqual([TEAM_PARTS.ardHitch.z, TEAM_PARTS.ardHitch.y]);
    expect(pair('ARD_GRIP')).toEqual([TEAM_PARTS.ardGrip.z, TEAM_PARTS.ardGrip.y]);
    expect(one('YOKE_SPAN')).toBe(TEAM_PARTS.oxSpan);
    expect(one('POLE_M')).toBe(TEAM_PARTS.poleM);
  });

  it('ruce oráče a honáčka v klipech plough-team.json míří k rukojeti a provazu', () => {
    const spec = JSON.parse(
      readFileSync(
        new URL('../../../../../tools/blender/plough-team.json', import.meta.url),
        'utf8',
      ),
    ) as {
      name: string;
      clips: { name: string; pose?: { reach?: Record<string, [number, number, number]> } }[];
    }[];
    const plowman = spec.find((s) => s.name === 'plowman')!;
    const clips = plowman.clips.map((c) => c.name);
    expect(clips).toEqual(expect.arrayContaining(['walk', 'plough', 'lead']));
    const reach = plowman.clips.find((c) => c.name === 'plough')!.pose!.reach!;
    // zápěstí těsně za dlaněmi a nad nimi, ruce po stranách rukojeti
    for (const [left, forward, up] of Object.values(reach)) {
      expect(Math.abs(Math.abs(left) - 0.21)).toBeLessThan(0.05);
      expect(TEAM_PARTS.plowmanPalm.z - forward).toBeGreaterThan(0);
      expect(TEAM_PARTS.plowmanPalm.z - forward).toBeLessThan(0.08);
      expect(up - TEAM_PARTS.plowmanPalm.y).toBeGreaterThan(0);
      expect(up - TEAM_PARTS.plowmanPalm.y).toBeLessThan(0.08);
    }
    const lead = plowman.clips.find((c) => c.name === 'lead')!.pose!.reach!['R']!;
    // vlevo v 0 A.D. = vpravo ve scéně se záporným znaménkem; dlaň kousek od cíle zápěstí
    const hand = TEAM_PARTS.boyHand;
    expect(Math.hypot(-lead[0] - hand.x, lead[2] - hand.y, lead[1] - hand.z)).toBeLessThan(0.1);
    expect(spec.find((s) => s.name === 'ox')!.clips.map((c) => c.name)).toContain('walk');
  });
});

describe('plough-team – přechod na nové místo', () => {
  const path = ploughPath(FIELD);
  const far = { x: FIELD.x - 30, z: FIELD.z - 12, hx: 0, hz: -1, lift: 0 };

  it('dojde rovně krokem a na dráhu naváže bez skoku; rádlo cestou nahoře', () => {
    const t0 = 500;
    const track = transitTrack(path, far, t0);
    const transit = track.transit!;
    expect(transit).not.toBeNull();
    const length = Math.hypot(transit.to.x - far.x, transit.to.z - far.z);
    expect(transit.arriveS - t0).toBeCloseTo(length / TRANSIT_SPEED_M_S, 3);
    const pose = createTeamPose();
    const start = trackPose(track, t0, pose);
    expect(start.yoke.x).toBeCloseTo(far.x, 9);
    expect(start.yoke.z).toBeCloseTo(far.z, 9);
    // na začátku ještě hledí, kam jelo, a rádlo má dole
    expect(start.yoke.fz).toBeCloseTo(-1, 6);
    expect(start.lift).toBeCloseTo(0, 9);
    expect(trackPose(track, (t0 + transit.arriveS) / 2, pose).lift).toBe(1);
    // plynule – poloha nejvýš krokem, směr bez trhnutí – a po příchodu po dráze
    const a = createTeamPose();
    const dt = 0.05;
    trackPose(track, t0, a);
    let prev = { x: a.yoke.x, z: a.yoke.z, hx: a.yoke.fx, hz: a.yoke.fz };
    for (let t = t0 + dt; t < transit.arriveS + 20; t += dt) {
      trackPose(track, t, a);
      const step = Math.hypot(a.yoke.x - prev.x, a.yoke.z - prev.z);
      expect(step).toBeLessThanOrEqual(TRANSIT_SPEED_M_S * dt * 1.01 + 1e-6);
      const turn = Math.acos(Math.min(1, a.yoke.fx * prev.hx + a.yoke.fz * prev.hz));
      expect(turn).toBeLessThan(0.12);
      prev = { x: a.yoke.x, z: a.yoke.z, hx: a.yoke.fx, hz: a.yoke.fz };
    }
    const after = trackPose(track, transit.arriveS + 7, createTeamPose());
    expect(after).toEqual(teamPose(path, transit.arriveS + 7, createTeamPose()));
  });

  it('čistá funkce času – stejný čas, stejná póza', () => {
    const track = transitTrack(path, far, 100);
    const a = trackPose(track, 112.3, createTeamPose());
    const b = trackPose(track, 140, createTeamPose());
    trackPose(track, 112.3, b);
    expect(b).toEqual(a);
  });

  it('nepatrný ani dlouhý posun přechod nemá (dlouhý – spřežení je rovnou na místě)', () => {
    const t = 42;
    const here = teamSpot(teamPose(path, t, createTeamPose()));
    expect(transitTrack(path, here, t).transit).toBeNull();
    const away = { ...far, x: FIELD.x - TRANSIT_M.max - 30 };
    expect(transitTrack(path, away, t).transit).toBeNull();
  });
});
