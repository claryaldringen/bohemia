import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import { foundVillage } from '../../actions';
import {
  finishFortification,
  outlineOf,
  startSectionDemolition,
  villageFortifications,
} from '../../fortifications';
import { startSectionUpgrade } from '../../fortification-upgrade';
import { advanceVillage } from '../../simulate';
import type { Construction, Fortification, VillageState, WallKind } from '../../types';
import { makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { gatePartView } from '../gate-parts';
import { segmentWall } from '../life';
import { sectionPieces, type SectionPiece } from '../section-spans';
import { fortSegments } from '../segments';
import { fortBlockingSegments } from '../walls';
import vlkovFort from './fixtures/vlkov-fort.json';

// Hradba je hradba, brána je brána (Martin 8. 11. 2026): vylepšení úseku sahá přesně po okraj
// brány – kus dílu s branou na straně úseku dostane vlastní hradbu, brána a kus sousedního úseku
// stojí beze změny. Opevnění Vlkova (palisáda, 7 bran) ze hry.

const DAY = dayIndexOf({ year: 866, month: 3, day: 15 });
const SIZE = 64;
const landscape = makeLandscape({ size: SIZE });
const EMPTY = packObstacles([], SIZE, 15);
/** Úsek A od brány na dílu 0 po bránu na dílu 2 (rovný), úsek B od ní po bránu na dílu 22. */
const A = 0;
const B = 2;

function vlkov(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
  );
  s.woodLogs = 20000;
  s.fortifications = [structuredClone(vlkovFort) as unknown as Fortification];
  return s;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const works = (s: VillageState): Construction[] =>
  s.constructions.filter((c) => c.kind === 'fortification');
const key = (w: { index: number; part?: string }): string => `${w.index}${w.part ?? ''}`;

function pieces(s: VillageState, gateSegment: number): SectionPiece[] {
  const fort = fortOf(s);
  const lengths = fortSegments(outlineOf(landscape, fort)!).map((x) => x.lengthM);
  return sectionPieces(lengths, fort.gates, gateSegment);
}

/** Hradba kusu úseku – celý díl, nebo kus dílu s branou (`gatePartView`). */
function wallAt(s: VillageState, p: Pick<SectionPiece, 'index' | 'part'>) {
  const fort = fortOf(s);
  const seg = fort.segments.find((x) => x.index === p.index)!;
  return segmentWall(fort, p.part === undefined ? seg : gatePartView(seg, p.part));
}

function upgrade(s: VillageState, segment: number, target: WallKind): VillageState {
  const r = startSectionUpgrade(s, DAY, landscape, EMPTY, {
    fortificationId: fortOf(s).id,
    segment,
    target,
  });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function demolish(s: VillageState, segment: number): VillageState {
  const r = startSectionDemolition(s, DAY, landscape, { fortificationId: fortOf(s).id, segment });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** Dokončí stavbu `id` (všechna práce odvedená) ke dni `day`. */
function finish(s: VillageState, id: number, day: number): void {
  const c = s.constructions.find((x) => x.id === id)!;
  c.done = c.cost;
  finishFortification(s, c, day);
  s.constructions = s.constructions.filter((x) => x.id !== id);
}

describe('vylepšení úseku po okraj brány (Vlkov)', () => {
  it('úsek A má po dokončení cílovou hradbu až k okrajům bran, úsek B a brány beze změny', () => {
    const s = vlkov();
    const a = pieces(s, A);
    const b = pieces(s, B);
    // úsek A končí kusy dílů s branou – za bránou na dílu 0, před bránou na dílu 2
    // (brána na dílu 0 stojí u jeho konce – kus za ní je kratší než pahýl a nepočítá se)
    expect(a.filter((p) => p.part !== undefined).map(key)).toEqual([`${B}before`]);
    const next = upgrade(s, 1, 'walkway');
    const c = works(next)[0]!;
    expect(c.fortSegments!.map(key).sort()).toEqual(a.map(key).sort());
    finish(next, c.id, DAY + 5);
    for (const p of a) expect(wallAt(next, p)?.kind).toBe('walkway');
    for (const p of b) expect(wallAt(next, p)).toEqual(wallAt(s, p));
    // brány (vrstvy dílu) zůstanou palisádou se svým dnem
    for (const g of [A, B]) {
      const before = fortOf(s).segments.find((x) => x.index === g)!;
      const after = fortOf(next).segments.find((x) => x.index === g)!;
      expect(segmentWall(fortOf(next), after)).toEqual(segmentWall(fortOf(s), before));
    }
    // stěny: kus dílu brány 2 na straně A pás ochozu, na straně B pás palisády
    const wall = fortBlockingSegments(fortOf(next), null).find((x) => x.index === B)!;
    expect(wall.parts).toEqual({ before: { kind: 'walkway' }, after: { kind: 'palisade' } });
  });

  it('souběžně vylepšení A a zboření B – díl s branou mezi nimi se nesrazí, pořadí nerozhoduje', () => {
    const s = vlkov();
    const started = demolish(upgrade(s, 1, 'walkway'), 10);
    const [up, down] = works(started);
    expect([up!.fortWork, down!.fortWork]).toEqual(['upgrade', 'demolish']);
    expect(down!.fortSegments!.some((w) => w.index === B && w.part === 'after')).toBe(true);
    const first = structuredClone(started);
    finish(first, up!.id, DAY + 5);
    finish(first, down!.id, DAY + 5);
    const second = structuredClone(started);
    finish(second, down!.id, DAY + 5);
    finish(second, up!.id, DAY + 5);
    // stejný stav (pořadí klíčů v JSON nehraje roli)
    expect(second.fortifications).toEqual(first.fortifications);
    for (const p of pieces(s, A)) expect(wallAt(first, p)?.kind).toBe('walkway');
    const gate = fortOf(first).segments.find((x) => x.index === B)!;
    expect(gate.demolishedDay).toBeUndefined();
    expect(gate.demolishedAfterGate).toBe(DAY + 5);
    expect(gate.demolishedBeforeGate).toBeUndefined();
    expect(wallAt(first, { index: B })?.kind).toBe('palisade');
  });

  it('po kouscích (1, 3, 10 dní + zbytek) dá stejný stav jako vcelku', () => {
    const base = upgrade(vlkov(), 1, 'walkway');
    const c = works(base)[0]!;
    // většina práce odvedená – kusy u bran se dokončí během 20 dní
    const last = c.fortSegments![c.fortSegments!.length - 1]!;
    c.done = c.cost - last.cost - 1e-3;
    base.lastDay = DAY;
    const whole = advanceVillage(structuredClone(base), DAY + 20, EMPTY, landscape);
    let chunks = structuredClone(base);
    for (const step of [1, 3, 10, 6]) {
      chunks = advanceVillage(chunks, chunks.lastDay + step, EMPTY, landscape);
    }
    expect(JSON.stringify(chunks.fortifications)).toBe(JSON.stringify(whole.fortifications));
    expect(JSON.stringify(chunks.constructions)).toBe(JSON.stringify(whole.constructions));
    expect(JSON.stringify(whole.fortifications)).toMatch(/"(before|after)Gate"/);
  });
});
