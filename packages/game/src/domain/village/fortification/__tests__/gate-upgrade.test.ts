import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import { foundVillage } from '../../actions';
import { cancelConstruction } from '../../cancel-construction';
import {
  FORT_GATE_LOW,
  FORT_GATE_NO_ROOM,
  FORT_TOWER_DONE,
  FORT_TOWER_NO_PINCER,
  gateUpgrade,
  startGateUpgrade,
  type GateLevel,
} from '../../fortification-gate';
import {
  FORT_BUSY,
  finishFortification,
  outlineOf,
  startFortification,
  villageFortifications,
} from '../../fortifications';
import { fortLayoutKey } from '../../paths/village';
import type { Construction, FortKind, Fortification, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';
import { crossingLayers } from '../assault';
import { squarePoints } from '../convert';
import { fortificationCost } from '../cost';
import { decideFortRebuilds, fortUpkeep } from '../decay';
import { gateChord } from '../gates';
import { FORT_DAYS_PER_YEAR } from '../life';
import { gateTowerStands } from '../pincer';
import { fortSegments } from '../segments';
import { fortWalls, insideQuad } from '../walls';

// Klešťová brána a věž nad branou (fortifications.md – Hradby a obrana, Brány; Martin 8. 11. 2026:
// „Od palisády výše může hráč či NPC vylepšit bránu ve dvou úrovních 1. klešťová brána (za
// opevněním však musí být dost místa) 2. dřevěná věž nad samotnou branou.“). Krajina 16 × 16
// políček po 15 m, opevnění na políčkách 8–11 (svět 0–60 m), brána sama v úseku nejblíž obydlí.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

/** Hotové opevnění `kind` (všechny díly dostavěné ke `DAY`). */
function built(kind: FortKind): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = 20000;
  const r = startFortification(s, DAY, landscape, EMPTY, {
    points: squarePoints(AREA, null, landscape, 'chamber')!,
    kind,
  });
  if (!r.ok) throw new Error(r.reason);
  const next = r.state;
  next.constructions = next.constructions.filter((c) => c.kind !== 'fortification');
  for (const seg of villageFortifications(next)[0]!.segments) {
    seg.builtDay = DAY;
    seg.state = 1;
  }
  next.lastDay = DAY;
  return next;
}

const fortOf = (s: VillageState): Fortification => villageFortifications(s)[0]!;
const gateOf = (s: VillageState) => fortOf(s).gates[0]!;
const works = (s: VillageState): Construction[] =>
  s.constructions.filter((c) => c.kind === 'fortification');

function ok(r: { ok: true; state: VillageState } | { ok: false; reason: string }): VillageState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const upgrade = (s: VillageState, level: GateLevel, day = DAY) =>
  startGateUpgrade(s, day, landscape, EMPTY, {
    fortificationId: fortOf(s).id,
    segment: gateOf(s).segment,
    level,
  });

/** Dokončí jedinou stavbu opevnění ke dni `day`. */
function finish(s: VillageState, day: number): VillageState {
  const c = works(s)[0]!;
  c.done = c.cost;
  finishFortification(s, c, day);
  s.constructions = s.constructions.filter((x) => x !== c);
  return s;
}

/** Bod osy brány: `along` m podél brány od středu tětivy, `inward` m dovnitř od křivky. */
function gatePoint(s: VillageState, along: number, inward: number): [number, number] {
  const outline = outlineOf(landscape, fortOf(s))!;
  const gate = gateOf(s);
  const { a, b } = gateChord(outline, fortSegments(outline)[gate.segment]!, gate);
  const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  // dovnitř jako otvor brány ve stěnách
  const nx = uz;
  const nz = -ux;
  return [
    (a[0] + b[0]) / 2 + ux * along + nx * inward,
    (a[1] + b[1]) / 2 + uz * along + nz * inward,
  ];
}

const inWall = (s: VillageState, p: [number, number]): boolean =>
  fortWalls(landscape, fortOf(s), null).walls.some((w) => insideQuad(w, p[0], p[1]));
const inGate = (s: VillageState, p: [number, number]): boolean =>
  fortWalls(landscape, fortOf(s), null).gates.some((g) => insideQuad(g, p[0], p[1]));

describe('klešťová brána (Hradby a obrana – Brány)', () => {
  it('u palisády projde – cena 24 m palisády s ochozem, brána se staví', () => {
    const s = built('palisade');
    const cost = gateUpgrade(s, landscape, {
      fortificationId: fortOf(s).id,
      segment: gateOf(s).segment,
      level: 'pincer',
    });
    const full = fortificationCost('walkway', 24);
    expect(cost).toEqual(full);
    // komplet ≈ 108 čd + 19,2 klády (Brány – „u palisády ≈ 110 čd + 20 klád“)
    expect(full.laborManDays + full.logs).toBeCloseTo(108, 6);
    const next = ok(upgrade(s, 'pincer'));
    expect(gateOf(next).pincerDay).toBeNull();
    const c = works(next)[0]!;
    expect(c).toMatchObject({
      fortWork: 'gate',
      fortGate: { segment: gateOf(s).segment, level: 'pincer' },
      fortSegments: [{ index: gateOf(s).segment, cost: full.laborManDays }],
    });
    // klády z hromady – 20 celých
    expect(next.woodLogs).toBe((s.woodLogs ?? 0) - 20);
    expect(gateOf(s).pincerDay).toBeUndefined();
  });

  it('u plotu nejde', () => {
    const s = built('fence');
    expect(upgrade(s, 'pincer')).toEqual({ ok: false, reason: FORT_GATE_LOW });
  });

  it('obydlí 10 m za vnitřním okrajem pásu podél cesty – „Za branou není místo.“', () => {
    const s = built('palisade');
    const first = s.dwellings[0]!;
    const [x, z] = gatePoint(s, 0, 1.5 + 10);
    s.dwellings.push({ ...first, id: s.nextId++, position: { x, z, rotation: 0 } });
    expect(upgrade(s, 'pincer')).toEqual({ ok: false, reason: FORT_GATE_NO_ROOM });
  });

  it('ramena blokují pěšiny bokem od zahájení, ulička průchozí; zrušení je vrátí', () => {
    const s = built('palisade');
    const arm: [number, number] = gatePoint(s, -2 - 2.75, 1.5 + 6);
    const alley: [number, number] = gatePoint(s, 0, 1.5 + 6);
    expect(inWall(s, arm)).toBe(false);
    const keyBefore = fortLayoutKey(s);
    const next = ok(upgrade(s, 'pincer'));
    const running = (st: VillageState): boolean =>
      fortWalls(landscape, fortOf(st), null).walls.length >
      fortWalls(landscape, fortOf(s), null).walls.length;
    expect(running(next)).toBe(true);
    expect(inWall(next, arm)).toBe(true);
    expect(inWall(next, gatePoint(s, 2 + 2.75, 1.5 + 6))).toBe(true);
    expect(inWall(next, alley)).toBe(false);
    expect(inGate(next, alley)).toBe(true);
    expect(fortLayoutKey(next)).not.toBe(keyBefore);
    // zrušená stavba – brána jako dřív
    const cancelled = cancelConstruction(next, DAY + 1, works(next)[0]!.id, landscape);
    expect(gateOf(cancelled).pincerDay).toBeUndefined();
    expect(inWall(cancelled, arm)).toBe(false);
    expect(fortLayoutKey(cancelled)).toBe(keyBefore);
  });

  it('po dokončení `pincerDay`, ramena stojí, druhá klešťová ne', () => {
    const next = finish(ok(upgrade(built('palisade'), 'pincer')), DAY + 9);
    expect(gateOf(next).pincerDay).toBe(DAY + 9);
    expect(inWall(next, gatePoint(next, -2 - 2.75, 1.5 + 6))).toBe(true);
    const fort = fortOf(next);
    const seg = fort.segments.find((x) => x.index === gateOf(next).segment)!;
    expect(crossingLayers(fort, seg, DAY + 9, true).gate).toEqual({ pincer: true, tower: false });
    expect(crossingLayers(fort, seg, DAY + 8, true).gate).toEqual({ pincer: false, tower: false });
    expect(upgrade(next, 'pincer', DAY + 10).ok).toBe(false);
  });
});

describe('věž nad branou (Hradby a obrana – Brány)', () => {
  it('bez klešťové brány nejde, s rozestavěnou ani ne', () => {
    const s = built('palisade');
    expect(upgrade(s, 'tower')).toEqual({ ok: false, reason: FORT_TOWER_NO_PINCER });
    const building = ok(upgrade(s, 'pincer'));
    expect(upgrade(building, 'tower')).toEqual({ ok: false, reason: FORT_BUSY });
  });

  it('na klešťové bráně: 120 čd komplet + 30 klád; dvakrát ne', () => {
    const s = finish(ok(upgrade(built('palisade'), 'pincer')), DAY + 9);
    // cena pro rozhraní ke dni vsi – klešťová brána musí stát
    s.lastDay = DAY + 10;
    const cost = gateUpgrade(s, landscape, {
      fortificationId: fortOf(s).id,
      segment: gateOf(s).segment,
      level: 'tower',
    });
    expect(cost).toEqual({ laborManDays: 90, logs: 30, stoneM3: 0 });
    const next = finish(ok(upgrade(s, 'tower', DAY + 10)), DAY + 20);
    expect(gateOf(next).towerDay).toBe(DAY + 20);
    expect(upgrade(next, 'tower', DAY + 21)).toEqual({ ok: false, reason: FORT_TOWER_DONE });
  });

  it('za 20 let dožije a obyvatelé ji přestaví plnou cenou', () => {
    const s = finish(ok(upgrade(built('palisade'), 'pincer')), DAY + 9);
    gateOf(s).towerDay = DAY + 10;
    // palisáda mladší než věž – přestavují se jen věž
    for (const seg of fortOf(s).segments) seg.builtDay = DAY + 10 + FORT_DAYS_PER_YEAR;
    const life = 20 * FORT_DAYS_PER_YEAR;
    const young = structuredClone(s);
    decideFortRebuilds(young, DAY + 10 + life - 1, landscape, EMPTY);
    expect(works(young)).toEqual([]);
    const old = structuredClone(s);
    const started = decideFortRebuilds(old, DAY + 10 + life, landscape, EMPTY);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      fortWork: 'gate',
      fortGate: { segment: gateOf(s).segment, level: 'tower' },
      fortSegments: [{ index: gateOf(s).segment, cost: 90 }],
    });
    // stará věž stojí, dokud se nedostaví nová
    expect(gateTowerStands(gateOf(old), DAY + 10 + life)).toBe(true);
    finish(old, DAY + 10 + life + 30);
    expect(gateOf(old).towerDay).toBe(DAY + 10 + life + 30);
  });

  it('bez dřeva chátrá a po 5 letech spadne; bez údržby stárne navíc', () => {
    const s = finish(ok(upgrade(built('palisade'), 'pincer')), DAY + 9);
    gateOf(s).towerDay = DAY + 10;
    s.woodLogs = 0;
    const life = 20 * FORT_DAYS_PER_YEAR;
    expect(decideFortRebuilds(s, DAY + 10 + life, landscape, EMPTY)).toEqual([]);
    expect(gateTowerStands(gateOf(s), DAY + 10 + life + 5 * FORT_DAYS_PER_YEAR - 1)).toBe(true);
    expect(gateTowerStands(gateOf(s), DAY + 10 + life + 5 * FORT_DAYS_PER_YEAR)).toBe(false);
    // údržba: bez práce věž stárne o den navíc
    const u = finish(ok(upgrade(built('palisade'), 'pincer')), DAY + 9);
    gateOf(u).towerDay = DAY + 10;
    fortUpkeep(u, 0, landscape);
    expect(gateOf(u).towerExtraAgeDays).toBeCloseTo(1, 9);
  });
});
