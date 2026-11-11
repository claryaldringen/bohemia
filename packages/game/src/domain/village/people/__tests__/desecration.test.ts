import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles, type ObstacleLayer, type ObstaclePlacement } from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { applyBuildIntent, type BuildIntent } from '../../buildings/build-intent';
import { CEMETERY } from '../../rules';
import { demolishStructure, demolitionBlock } from '../../buildings/demolition';
import {
  CEMETERY_IN_USE,
  cemeteryMayGo,
  lastBurialDay,
  protectedTreesFor,
  recordDesecration,
  sacredSitesFor,
} from '../desecration';
import {
  checkDwellingPlacement,
  fieldPartsFromCells,
  placementVillageOf,
} from '../../placement/placement';
import { playerPlacementVillage } from '../../placement/placement-village';
import { SACRED_OAK } from '../../rules';
import { sacredSitesOf } from '../sacred';
import { advanceVillage } from '../../core/simulate';
import type { Cemetery, Position, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';

// Posvátná místa a hřbitov po křtu rodu (christianity.md – Co křest rodu umožní). Ruční krajina
// 16 × 16 políček po 15 m se středem v počátku (jako sacred.test.ts): velký osamělý dub na
// políčku (8, 8), dubový háj (12 dubů) na políčkách (3, 12) a (4, 12), bukový les vpravo dole.

const DAY = dayIndexOf({ year: 900, month: 4, day: 1 });
const HOME: Position = { x: -100, z: -20, rotation: 0 };
const BIG_OAK = 1;
const tree = (
  id: number,
  look: ObstaclePlacement['look'],
  x: number,
  z: number,
  scale = 1,
): ObstaclePlacement => ({ id, kind: 'tree', look, x, z, rotation: 0, scale });

function makeLayer(): ObstacleLayer {
  const placements: ObstaclePlacement[] = [tree(BIG_OAK, 'oak-large-1', 7.5, 7.5, 1.2)];
  let id = 10;
  for (const z of [65, 60, 70])
    for (const x of [-70, -75, -65, -60]) placements.push(tree(id++, 'oak-1', x, z));
  id = 100;
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) placements.push(tree(id++, 'beech-1', 30 + i * 5, -70 + j * 5));
  }
  return packObstacles(placements, 16, 15);
}

const layer = makeLayer();
const landscape = makeLandscape();
const sites = sacredSitesOf(layer);
const pagan = (): VillageState =>
  foundVillage({ seed: 3, day: DAY, dwellingPosition: HOME, obstacles: layer });
const baptized = (): VillageState => {
  const s = pagan();
  return { ...s, faith: { ...s.faith, rodBaptizedDay: DAY - 400 } };
};
const ON_GROVE: Position = { x: -67, z: 66, rotation: 0 };
const build = (s: VillageState, intent: BuildIntent, actor?: 'steward') =>
  applyBuildIntent(s, s.lastDay, landscape, layer, intent, actor);

describe('posvátná místa pro stavby hráče', () => {
  it('nepokřtěný rod – háj a dub chrání; pokřtěný – stavbám hráče nic, správci dál ano', () => {
    const s = baptized();
    expect(sacredSitesFor(playerPlacementVillage(pagan(), DAY), layer)).toBe(sites);
    expect(protectedTreesFor(playerPlacementVillage(s, DAY), layer).size).toBe(0);
    expect(protectedTreesFor(placementVillageOf(s, DAY), layer)).toBe(sites.protectedTrees);
  });

  it('nepokřtěná ves: stavba na háji odmítnuta jako dřív', () => {
    const result = build(pagan(), { kind: 'dwelling', type: 'zemnice', position: ON_GROVE });
    expect(result).toEqual({
      ok: false,
      reason: 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.',
    });
  });

  it('pokřtěná ves: stavba na háji povolena, háj se zapíše jednou, i po dokončení', () => {
    const s = baptized();
    const check = checkDwellingPlacement(
      landscape,
      playerPlacementVillage(s, DAY),
      'zemnice',
      ON_GROVE,
      layer,
    );
    expect(check.ok).toBe(true);
    expect(check.spared).toEqual({ oaks: [], groves: [] });
    const result = build(s, { kind: 'dwelling', type: 'zemnice', position: ON_GROVE });
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.faith?.desecrated).toEqual({ oaksOrGroves: 1, cemeteries: 0 });
    expect(result.state.chronicle.at(-1)).toEqual({
      day: s.lastDay,
      kind: 'sacred-felled',
      site: 'grove',
    });
    // druhá stavba na témž háji háj znovu nepočítá; dostavění nic nepřidá
    const second = build(result.state, {
      kind: 'dwelling',
      type: 'zemnice',
      position: { x: -50, z: 66, rotation: 0 },
    });
    const after = second.ok ? second.state : result.state;
    const done = advanceVillage(after, DAY + 200, layer, landscape);
    expect(done.faith?.desecrated?.oaksOrGroves).toBe(1);
  });

  it('správce v pokřtěné vsi posvátná místa dál obchází', () => {
    const result = build(
      baptized(),
      { kind: 'dwelling', type: 'zemnice', position: ON_GROVE },
      'steward',
    );
    expect(result.ok).toBe(false);
  });

  it('pole přes háj a dub v pokřtěné vsi: bez vyjmutí háje a bez odečtu koruny', () => {
    const s = baptized();
    const groveField = fieldPartsFromCells(
      landscape,
      playerPlacementVillage(s, DAY),
      block(2, 11, 4, 3),
      [HOME],
      layer,
    );
    expect(groveField.check.ok).toBe(true);
    expect(groveField.check.warning).toBeUndefined();
    expect(groveField.parts).toHaveLength(12);
    const oakField = fieldPartsFromCells(
      landscape,
      playerPlacementVillage(s, DAY),
      block(8, 8, 1, 1),
      [HOME],
      layer,
    );
    expect(oakField.parts[0]!.areaM2).toBe(225);
    expect(oakField.parts[0]!.obstacleIds).toContain(BIG_OAK);
    // v nepokřtěné vsi koruna dubu ubere plochu jako dřív
    const paganOak = fieldPartsFromCells(
      landscape,
      playerPlacementVillage(pagan(), DAY),
      block(8, 8, 1, 1),
      [HOME],
      layer,
    );
    expect(paganOak.parts[0]!.areaM2).toBe(225 - SACRED_OAK.crownM2);
  });

  it('založené pole zapíše dub a háj, až díly odstraní překážky – vcelku = po kouscích', () => {
    const result = build(baptized(), { kind: 'field', cells: block(2, 11, 4, 3) });
    if (!result.ok) throw new Error(result.reason);
    const oak = build(result.state, { kind: 'field', cells: block(7, 7, 3, 3) });
    if (!oak.ok) throw new Error(oak.reason);
    expect(oak.state.faith?.desecrated).toBeUndefined();
    const end = DAY + 400;
    const whole = advanceVillage(oak.state, end, layer, landscape);
    let pieces = oak.state;
    for (let day = DAY + 37; day < end; day += 37)
      pieces = advanceVillage(pieces, day, layer, landscape);
    pieces = advanceVillage(pieces, end, layer, landscape);
    expect(whole.faith?.desecrated).toEqual({ oaksOrGroves: 2, cemeteries: 0 });
    expect(pieces.faith).toEqual(whole.faith);
    const felled = (s: VillageState) => s.chronicle.filter((e) => e.kind === 'sacred-felled');
    expect(
      felled(whole)
        .map((e) => (e.kind === 'sacred-felled' ? e.site : null))
        .sort(),
    ).toEqual(['grove', 'oak']);
    expect(felled(pieces)).toEqual(felled(whole));
  });

  it('vesničané posvátný dub ani háj na dřevo nevezmou ani v pokřtěné vsi', () => {
    const s = baptized();
    const result = build(s, {
      kind: 'dwelling',
      type: 'zemnice',
      position: { x: -20, z: 20, rotation: 0 },
    });
    if (!result.ok) throw new Error(result.reason);
    const done = advanceVillage(result.state, DAY + 300, layer, landscape);
    const felled = (done.felledTrees ?? []).map((f) => f.id);
    expect(felled.length).toBeGreaterThan(0);
    for (const id of felled) expect(sites.protectedTrees.has(id)).toBe(false);
    for (const c of result.state.constructions) {
      for (const t of c.wood?.fell ?? []) expect(sites.protectedTrees.has(t.id!)).toBe(false);
    }
    expect(done.faith?.desecrated).toBeUndefined();
  });
});

describe('hřbitov po křtu', () => {
  const YEAR = 365;
  const cemetery = (graves: number, lastBurial: number | null): Cemetery => ({
    id: 900,
    squares: [{ cell: { x: 12, y: 3 }, x: 67.5, z: -67.5, waterDistanceM: 500 }],
    squareSizeM: 15,
    graves,
    builtDay: DAY - 100 * YEAR,
    ...(lastBurial === null
      ? {}
      : {
          mounds: [
            {
              cell: { x: 12, y: 3 },
              column: 0,
              row: 0,
              size: 'small',
              rank: 'adult',
              day: lastBurial,
            },
          ],
        }),
  });
  const withCemetery = (s: VillageState, c: Cemetery): VillageState => ({ ...s, cemeteries: [c] });

  it('smí zmizet: pokřtěný rod a plný, nebo poslední pohřeb před 10 lety', () => {
    const full = cemetery(CEMETERY.gravesPerSquare, null);
    expect(cemeteryMayGo(baptized(), full, DAY)).toBe(true);
    expect(cemeteryMayGo(pagan(), full, DAY)).toBe(false);
    expect(cemeteryMayGo(baptized(), cemetery(3, DAY - YEAR), DAY)).toBe(false);
    expect(cemeteryMayGo(baptized(), cemetery(3, DAY - 11 * YEAR), DAY)).toBe(true);
    // poslední pohřeb před začátkem světa (den < 0) nehodí výjimku a je dávno
    expect(cemeteryMayGo(baptized(), cemetery(3, -5), DAY)).toBe(true);
    // jen staré hroby bez dne – počítá se od dokončení
    expect(lastBurialDay(cemetery(3, null))).toBe(DAY - 100 * YEAR);
  });

  it('zbourání: plný ano a zapíše se jednou, s volným místem a pohřbem loni ne', () => {
    const ref = { structure: 'cemetery' as const, id: 900 };
    const used = withCemetery(baptized(), cemetery(3, DAY - YEAR));
    expect(demolitionBlock(used, ref, DAY)).toBe(CEMETERY_IN_USE);
    expect(demolitionBlock(withCemetery(pagan(), cemetery(56, null)), ref, DAY)).toBe(
      CEMETERY_IN_USE,
    );
    const full = withCemetery(baptized(), cemetery(CEMETERY.gravesPerSquare, null));
    const started = demolishStructure(full, DAY, ref);
    if (!started.ok) throw new Error(started.reason);
    const done = advanceVillage(started.state, DAY + 60, layer, landscape);
    expect(done.cemeteries ?? []).toEqual([]);
    expect(done.faith?.desecrated).toEqual({ oaksOrGroves: 0, cemeteries: 1 });
    expect(done.chronicle.filter((e) => e.kind === 'cemetery-ploughed')).toHaveLength(1);
  });

  it('kronika a počítadlo: dub a háj do oaksOrGroves, hřbitov do cemeteries', () => {
    const s = structuredClone(pagan());
    recordDesecration(s, 'oak', DAY);
    recordDesecration(s, 'grove', DAY);
    recordDesecration(s, 'cemetery', DAY);
    expect(s.faith?.desecrated).toEqual({ oaksOrGroves: 2, cemeteries: 1 });
    expect(s.chronicle.slice(-3)).toEqual([
      { day: DAY, kind: 'sacred-felled', site: 'oak' },
      { day: DAY, kind: 'sacred-felled', site: 'grove' },
      { day: DAY, kind: 'cemetery-ploughed' },
    ]);
  });
});

describe('pole a stavba přes hřbitov po křtu', () => {
  const YEAR = 365;
  const cemeteryAt = (graves: number, lastBurial: number): Cemetery => ({
    id: 900,
    squares: [{ cell: { x: 12, y: 3 }, x: 67.5, z: -52.5, waterDistanceM: 500 }],
    squareSizeM: 15,
    graves,
    builtDay: DAY - 100 * YEAR,
    mounds: [
      { cell: { x: 12, y: 3 }, column: 0, row: 0, size: 'small', rank: 'adult', day: lastBurial },
    ],
  });
  const field: BuildIntent = { kind: 'field', cells: block(11, 2, 3, 3) };

  it('plný hřbitov pokřtěný rod zaorá polem; s volným místem a pohřbem loni ne', () => {
    const full = { ...baptized(), cemeteries: [cemeteryAt(CEMETERY.gravesPerSquare, DAY - YEAR)] };
    const ploughed = build(full, field);
    if (!ploughed.ok) throw new Error(ploughed.reason);
    expect(ploughed.state.cemeteries).toEqual([]);
    expect(ploughed.state.faith?.desecrated).toEqual({ oaksOrGroves: 0, cemeteries: 1 });
    expect(ploughed.state.chronicle.at(-1)).toMatchObject({ kind: 'cemetery-ploughed' });
    const used = { ...baptized(), cemeteries: [cemeteryAt(3, DAY - YEAR)] };
    expect(build(used, field)).toEqual({ ok: false, reason: 'Pole se překrývá s hřbitovem.' });
    const pagan_ = { ...pagan(), cemeteries: [cemeteryAt(CEMETERY.gravesPerSquare, DAY - YEAR)] };
    expect(build(pagan_, field).ok).toBe(false);
    // pole vedle hřbitova ho nechá být
    const beside = build(full, { kind: 'field', cells: block(2, 2, 3, 3) });
    if (!beside.ok) throw new Error(beside.reason);
    expect(beside.state.cemeteries).toHaveLength(1);
  });
});
