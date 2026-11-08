import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import { foundVillage } from '../../actions';
import { cancelConstruction } from '../../cancel-construction';
import {
  addGateToFortification,
  finishFortification,
  FORT_BUSY,
  outlineOf,
  startFortification,
  startFortificationUpgrade,
  startSectionDemolition,
  villageFortifications,
  workFortification,
} from '../../fortifications';
import {
  FORT_UPGRADE_NONE,
  sectionUpgrades,
  startSectionUpgrade,
} from '../../fortification-upgrade';
import { FORT_BEND_KIND } from '../../placement-fortifications';
import type { Construction, FortKind, Fortification, VillageState, WallKind } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { squarePoints } from '../convert';
import { fortificationCost, FORT_WALKWAY_NEW, FORT_WALL_YEAR } from '../cost';
import { segmentIsGap } from '../defense';
import { segmentWall } from '../life';
import { outlineBend } from '../outline';
import { fortRuns } from '../runs';
import { sectionOf } from '../sections';
import { fortSegments } from '../segments';
import { fortBlockingSegments } from '../walls';

// Vylepšení opevnění po úsecích (fortifications.md – Hradby a obrana, Druhy a postup vylepšení;
// demolition.md – Opevnění): úsek mezi branami na kterýkoli vyšší stupeň za cenu cílového, ochoz jen
// na palisádu, roštová od 790, komorová od 830, mezera za cenu nové; víc staveb na jednom
// opevnění, jedna na díl (Martin 8. 11. 2026). Krajina 16 × 16 políček po 15 m.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const DAY_830 = dayIndexOf({ year: 830, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

/**
 * Hotové opevnění `kind` (všechny díly dostavěné ke `DAY`), body obvodu s rohy druhu `corners`
 * (komorová – mírné rohy projdou každým druhem); hodně klád a kamene na hromadách.
 */
function built(kind: FortKind, corners: FortKind = 'chamber'): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 20000;
  const r = startFortification(s, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, corners)!,
    kind,
  });
  if (!r.ok) throw new Error(r.reason);
  const next = r.state;
  next.constructions = next.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(next)[0]!.segments) {
    seg.builtDay = DAY;
    seg.state = 1;
  }
  next.woodLogs = 20000;
  next.stoneM3 = 20000;
  next.stoneStacks = [{ id: 1, x: 30, z: 30, m3: 20000 }];
  next.lastDay = DAY;
  return next;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const shapesOf = (s: VillageState) => fortSegments(outlineOf(landscape, fortOf(s))!);
const works = (s: VillageState): Construction[] =>
  s.constructions.filter((c) => c.kind === 'fortification');
const wallOf = (s: VillageState, index: number): WallKind | undefined => {
  const fort = fortOf(s);
  return segmentWall(
    fort,
    fort.segments.find((x) => x.index === index)!,
  )?.kind;
};

/** Přidá bránu na díl `segment` (klik na střed dílu). */
function withGate(s: VillageState, segment: number): VillageState {
  const shape = shapesOf(s)[segment]!;
  const r = addGateToFortification(s, landscape, fortOf(s).id, {
    x: shape.mid[0],
    z: shape.mid[1],
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Opevnění se dvěma branami naproti sobě – dva úseky A a B. */
function twoSections(kind: FortKind, corners: FortKind = 'chamber'): VillageState {
  const s = built(kind, corners);
  const n = fortOf(s).segments.length;
  return withGate(s, (fortOf(s).gates[0]!.segment + Math.floor(n / 2)) % n);
}

/**
 * Díly úseků A (od první brány) a B (od druhé) a jejich díly mezi branami (`a`, `b` bez dílů
 * s branou – díl s branou vylepšení úseku zvedne, až bude hradba po obou stranách brány stejná).
 */
function sections(s: VillageState): {
  a: readonly number[];
  b: readonly number[];
  gates: number[];
} {
  const fort = fortOf(s);
  const gates = [...fort.gates].map((g) => g.segment);
  const inner = (g: number) => sectionOf(fort, g)!.segments.filter((i) => !gates.includes(i));
  return { a: inner(gates[0]!), b: inner(gates[1]!), gates };
}

function ok(r: { ok: true; state: VillageState } | { ok: false; reason: string }): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Dokončí stavbu `c` (všechna práce odvedená). */
function finish(s: VillageState, c: Construction, day = DAY + 10): void {
  c.done = c.cost;
  finishFortification(s, c, day);
  s.constructions = s.constructions.filter((x) => x.id !== c.id);
}

const upgrade = (s: VillageState, segment: number | null, target: WallKind, day = DAY) =>
  startSectionUpgrade(s, day, landscape, EMPTY, { fortificationId: fortOf(s).id, segment, target });

/** Cena dílů `indices` vylepšených na `target` ze stojící `from` (null – nové). */
function costOf(
  s: VillageState,
  indices: readonly number[],
  target: WallKind,
  from: WallKind | null,
) {
  const shapes = shapesOf(s);
  return indices.reduce(
    (sum, i) => {
      const c = fortificationCost(target, shapes[i]!.lengthM, from);
      return {
        labor: sum.labor + c.laborManDays,
        logs: sum.logs + c.logs,
        stone: sum.stone + c.stoneM3,
      };
    },
    { labor: 0, logs: 0, stone: 0 },
  );
}

describe('vylepšení po úsecích', () => {
  it('plot se 2 branami – úsek A na palisádu, B zůstane plot; po obou je celé palisáda', () => {
    const s = twoSections('fence');
    const { a, b, gates } = sections(s);
    const next = ok(upgrade(s, a[0]!, 'palisade'));
    const c = works(next)[0]!;
    expect(c).toMatchObject({ fortWork: 'upgrade', fortTarget: 'palisade' });
    expect(c.fortSegments!.map((w) => w.index).sort((x, y) => x - y)).toEqual(
      [...a].sort((x, y) => x - y),
    );
    // plot nic nevrací – cena palisády za délku úseku (klády z hromady, bez kácení)
    expect(c.cost).toBeCloseTo(costOf(s, a, 'palisade', 'fence').labor, 6);
    // stará hradba stojí a brání, dokud díl není hotový
    expect(wallOf(next, a[0]!)).toBe('fence');
    finish(next, c);
    for (const i of a) expect(wallOf(next, i)).toBe('palisade');
    for (const i of b) expect(wallOf(next, i)).toBe('fence');
    // brány zůstanou plotem, dokud hradba po obou stranách není palisáda
    for (const g of gates) expect(wallOf(next, g)).toBe('fence');
    expect(fortOf(next).kind).toBe('fence');
    const both = ok(upgrade(next, b[0]!, 'palisade'));
    const second = works(both)[0]!;
    expect(second.fortSegments!.map((w) => w.index).sort((x, y) => x - y)).toEqual(
      [...b, ...gates].sort((x, y) => x - y),
    );
    finish(both, second);
    // plot, který je celý palisádou, je palisáda – přepisy dílů zmizí
    expect(fortOf(both).kind).toBe('palisade');
    expect(fortOf(both).segments.every((x) => x.kind === undefined)).toBe(true);
  });

  it('palisáda → komorová za cenu komorové (skok o víc stupňů), stará palisáda stojí do konce', () => {
    const s = twoSections('palisade');
    const { a } = sections(s);
    const next = ok(upgrade(s, a[0]!, 'chamber', DAY_830));
    const c = works(next)[0]!;
    const want = costOf(s, a, 'chamber', 'palisade');
    expect(want).toEqual(costOf(s, a, 'chamber', null));
    expect(c.cost).toBeCloseTo(want.labor, 6);
    expect(next.stoneM3).toBeCloseTo(20000 - want.stone, 6);
    expect(next.woodLogs).toBe(20000 - Math.ceil(want.logs - 1e-9));
    finish(next, c, DAY_830 + 5);
    for (const i of a) {
      const seg = fortOf(next).segments.find((x) => x.index === i)!;
      expect(segmentWall(fortOf(next), seg)).toMatchObject({
        kind: 'chamber',
        builtDay: DAY_830 + 5,
      });
    }
  });

  it('palisáda → ochoz za 150 čd + 10 klád na 100 m, den palisády zůstane (přístavba)', () => {
    const s = twoSections('palisade');
    const { a } = sections(s);
    const next = ok(upgrade(s, a[0]!, 'walkway'));
    const c = works(next)[0]!;
    const want = costOf(s, a, 'walkway', 'palisade');
    const len = a.reduce((sum, i) => sum + shapesOf(s)[i]!.lengthM, 0);
    expect(want.logs).toBeCloseTo((10 * len) / 100, 6);
    expect(c.cost).toBeCloseTo(want.labor, 6);
    finish(next, c);
    for (const i of a) {
      const seg = fortOf(next).segments.find((x) => x.index === i)!;
      expect(segmentWall(fortOf(next), seg)).toMatchObject({ kind: 'walkway', builtDay: DAY });
    }
  });

  it('ochoz jen na stojící palisádu – plot ani mezera rovnou na ochoz nejdou (Martin 8. 11.)', () => {
    const s = twoSections('fence');
    const { a } = sections(s);
    expect(upgrade(s, a[0]!, 'walkway')).toEqual({ ok: false, reason: FORT_WALKWAY_NEW });
    const options = sectionUpgrades(s, DAY, landscape, EMPTY, {
      fortificationId: fortOf(s).id,
      segment: a[0]!,
    });
    expect(options.map((o) => [o.target, o.block])).toEqual([
      ['palisade', null],
      ['walkway', FORT_WALKWAY_NEW],
      ['crib', FORT_WALL_YEAR('crib')],
      ['chamber', FORT_WALL_YEAR('chamber')],
    ]);
    // nabídka palisády ukazuje práci bez kácení a klády
    const palisade = costOf(s, a, 'palisade', 'fence');
    expect(options[0]!.laborManDays).toBeCloseTo(palisade.labor, 6);
    expect(options[0]!.logs).toBeCloseTo(palisade.logs, 6);
  });

  it('Review Focus 1 – roštová 31. 12. 789 zašedlá s důvodem, 1. 1. 790 dostupná', () => {
    const s = twoSections('palisade');
    const input = { fortificationId: fortOf(s).id, segment: sections(s).a[0]! };
    const at = (day: number) =>
      sectionUpgrades(s, day, landscape, EMPTY, input).find((o) => o.target === 'crib')!.block;
    expect(at(dayIndexOf({ year: 789, month: 12, day: 31 }))).toBe(FORT_WALL_YEAR('crib'));
    expect(at(dayIndexOf({ year: 790, month: 1, day: 1 }))).toBeNull();
  });

  it('val – úsek A nástavba plot, úsek B roštová; holý val nabízí všechny stupně', () => {
    const s = twoSections('rampart');
    const { a, b } = sections(s);
    const options = sectionUpgrades(s, DAY_830, landscape, EMPTY, {
      fortificationId: fortOf(s).id,
      segment: a[0]!,
    });
    expect(options.map((o) => o.target)).toEqual([
      'fence',
      'palisade',
      'walkway',
      'crib',
      'chamber',
    ]);
    expect(options.find((o) => o.target === 'walkway')!.block).toBe(FORT_WALKWAY_NEW);
    let next = ok(upgrade(s, a[0]!, 'fence', DAY_830));
    // jiný úsek smí mít vlastní stavbu současně
    next = ok(upgrade(next, b[0]!, 'crib', DAY_830));
    const [ca, cb] = works(next);
    expect(ca).toMatchObject({ fortWork: 'top', fortTarget: 'fence' });
    expect(cb).toMatchObject({ fortWork: 'top', fortTarget: 'crib' });
    expect(cb!.cost).toBeCloseTo(costOf(s, b, 'crib', null).labor, 6);
    finish(next, ca!, DAY_830 + 1);
    finish(next, cb!, DAY_830 + 2);
    const fort = fortOf(next);
    for (const i of a) {
      const seg = fort.segments.find((x) => x.index === i)!;
      expect(segmentWall(fort, seg)).toMatchObject({ kind: 'fence', builtDay: DAY_830 + 1 });
      expect(seg.builtDay).toBe(DAY);
    }
    for (const i of b) expect(wallOf(next, i)).toBe('crib');
    expect(fort.kind).toBe('rampart');
  });

  it('zbořený úsek – Vylepšit postaví cílový druh za cenu nového a díl přestane být mezerou', () => {
    const s = twoSections('fence');
    const { a } = sections(s);
    const fortId = fortOf(s).id;
    const razed = ok(
      startSectionDemolition(s, DAY, landscape, { fortificationId: fortId, segment: a[1]! }),
    );
    finish(razed, works(razed)[0]!);
    const gaps = fortOf(razed).segments.filter((x) => x.demolishedDay !== undefined);
    expect(gaps.length).toBeGreaterThan(0);
    const next = ok(upgrade(razed, a[1]!, 'palisade'));
    const c = works(next)[0]!;
    // zbořené díly za cenu nové palisády, kusy dílů bran u okraje brány postaví znovu svůj druh
    expect(c.fortSegments!.some((w) => w.part !== undefined)).toBe(true);
    const whole = c.fortSegments!.filter((w) => w.part === undefined).map((w) => w.index);
    const gapIdx = gaps.map((x) => x.index);
    const gapCost = costOf(razed, gapIdx, 'palisade', null).labor;
    const rest = costOf(
      razed,
      whole.filter((i) => !gapIdx.includes(i)),
      'palisade',
      'fence',
    ).labor;
    const parts = c.fortSegments!.filter((w) => w.part !== undefined);
    expect(parts.every((w) => w.cost > 0)).toBe(true);
    expect(c.cost).toBeCloseTo(gapCost + rest + parts.reduce((sum, w) => sum + w.cost, 0), 6);
    // zbořený díl, který se staví znovu, blokuje pásem cílové hradby (staveniště)
    const runs = fortRuns(next.constructions, fortId);
    const blocking = fortBlockingSegments(fortOf(next), runs);
    expect(blocking.find((x) => x.index === gapIdx[0])?.kind).toBe('palisade');
    finish(next, c);
    const fort = fortOf(next);
    for (const i of gapIdx) {
      const seg = fort.segments.find((x) => x.index === i)!;
      expect(seg.demolishedDay).toBeUndefined();
      expect(segmentIsGap(fort, seg, DAY + 10)).toBe(false);
      expect(wallOf(next, i)).toBe('palisade');
    }
    expect(
      fort.segments.some(
        (x) => x.demolishedBeforeGate !== undefined || x.demolishedAfterGate !== undefined,
      ),
    ).toBe(false);
  });

  it('víc staveb na opevnění – jedna na díl: vylepšit A a bourat B, druhá stavba na A neprojde', () => {
    const s = twoSections('palisade');
    const { a, b } = sections(s);
    const fortId = fortOf(s).id;
    let next = ok(upgrade(s, a[0]!, 'walkway'));
    expect(upgrade(next, a[0]!, 'walkway')).toEqual({ ok: false, reason: FORT_BUSY });
    expect(
      startSectionDemolition(next, DAY, landscape, { fortificationId: fortId, segment: a[1]! }),
    ).toEqual({ ok: false, reason: FORT_BUSY });
    next = ok(
      startSectionDemolition(next, DAY, landscape, { fortificationId: fortId, segment: b[1]! }),
    );
    expect(works(next).map((c) => c.fortWork)).toEqual(['upgrade', 'demolish']);
    // vylepšení celého opevnění čeká, dokud na jeho dílech běží jiná stavba
    expect(upgrade(next, null, 'walkway')).toEqual({ ok: false, reason: FORT_BUSY });
    const [up, down] = works(next);
    finish(next, down!);
    finish(next, up!);
    for (const i of a) expect(wallOf(next, i)).toBe('walkway');
    expect(
      fortOf(next).segments.filter((x) => x.demolishedDay !== undefined).length,
    ).toBeGreaterThan(0);
  });

  it('zrušené vylepšení – hotové díly mají cílovou hradbu, ostatní starou', () => {
    const s = twoSections('fence');
    const { a } = sections(s);
    const next = ok(upgrade(s, a[0]!, 'palisade'));
    const c = works(next)[0]!;
    const first = c.fortSegments![0]!;
    c.done = first.cost + 1e-6;
    workFortification(next, c, DAY + 2);
    const cancelled = cancelConstruction(next, DAY + 3, c.id, landscape);
    expect(works(cancelled)).toEqual([]);
    expect(wallOf(cancelled, first.index)).toBe('palisade');
    const others = a.filter((i) => i !== first.index);
    for (const i of others) expect(wallOf(cancelled, i)).toBe('fence');
  });

  it('překážka v širším pásu jen v úseku B – A projde, B má důvod', () => {
    const s = twoSections('palisade');
    const { a, b } = sections(s);
    const shapes = shapesOf(s);
    const mid = shapes[b[Math.floor(b.length / 2)]!]!.mid;
    // skalní výchoz 4 m dovnitř od obvodu – mimo pás palisády (1,5 m), v pásu ochozu (5,5 m)
    const dx = 30 - mid[0];
    const dz = 30 - mid[1];
    const d = Math.sqrt(dx * dx + dz * dz);
    const rock = packObstacles(
      [
        {
          id: 1,
          kind: 'outcrop',
          look: 'rock-ridge',
          x: mid[0] + (4 * dx) / d,
          z: mid[1] + (4 * dz) / d,
          rotation: 0,
          scale: 0.5,
        },
      ],
      16,
      15,
    );
    const go = (segment: number) =>
      startSectionUpgrade(s, DAY, landscape, rock, {
        fortificationId: fortOf(s).id,
        segment,
        target: 'walkway',
      });
    expect(go(a[0]!).ok).toBe(true);
    const r = go(b[0]!);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('skalní výchoz');
  });

  it('ohyb úseku ostřejší, než cílový druh snese → důvod; rovný úsek projde', () => {
    // rohy palisády (3 m) – komorová chce 10 m
    let s = built('palisade', 'palisade');
    const outline = outlineOf(landscape, fortOf(s))!;
    const n = fortOf(s).segments.length;
    const straight = [...Array(n).keys()].find(
      (i) => outlineBend(outline, 10, new Set([i])).radiusM >= 10,
    )!;
    s = withGate(s, (straight - 1 + n) % n);
    s = withGate(s, (straight + 1) % n);
    const fortId = fortOf(s).id;
    const sec = sectionOf(fortOf(s), straight)!;
    expect(sec.segments).toEqual([(straight - 1 + n) % n, straight]);
    const go = (segment: number | null) =>
      startSectionUpgrade(s, DAY_830, landscape, EMPTY, {
        fortificationId: fortId,
        segment,
        target: 'chamber',
      });
    expect(go(straight).ok).toBe(true);
    expect(go((straight + 2) % n)).toEqual({ ok: false, reason: FORT_BEND_KIND });
    expect(go(null)).toEqual({ ok: false, reason: FORT_BEND_KIND });
  });

  it('úsek, který cílovou hradbu už má – nic k vylepšení; starší vylepšení celého beze změny', () => {
    const s = twoSections('palisade');
    expect(upgrade(s, null, 'palisade')).toEqual({ ok: false, reason: FORT_UPGRADE_NONE });
    // starší akce (správce, panel celého opevnění) dál bez cílové hradby ve stavbě
    const fence = twoSections('fence');
    const old = ok(
      startFortificationUpgrade(fence, DAY, landscape, EMPTY, {
        fortificationId: fortOf(fence).id,
        work: 'upgrade',
      }),
    );
    expect(works(old)[0]!.fortTarget).toBeUndefined();
  });
});
