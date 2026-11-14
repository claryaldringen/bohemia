import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import {
  CELL_SIZE_M,
  LANDSCAPE_SIZE,
  packObstacles,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../../landscape';
import { foundField, foundVillage } from '../../core/actions';
import { fieldPartLooks } from '../../fields/field-progress';
import {
  clearingFellCost,
  clearingStage,
  isSmoldering,
  partCenter,
  treesDue,
} from '../forest-clearing';
import { obstacleChangesAt } from '../../core/obstacles';
import { fieldPartsFromCells, placementVillageOf } from '../../placement/placement';
import { FOREST_CLEARING, LOG_PILES } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import { build, constructionNeed, foundingIndex, invest } from '../../core/simulate-build';
import { squareCenter } from '../../placement/square-grid';
import { forestBonusUntil } from '../../core/simulate-plan';
import type {
  ClearingStage,
  Construction,
  FieldPart,
  Person,
  Position,
  VillageState,
} from '../../types';
import { pileLogs } from '../wood';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Klučení lesa pro pole v simulaci (forest.md – Klučení lesa pro pole – postup): kácení po
// stromech s kládami na hromadu u lesa, schnutí 30 dní, pálení jen březen–říjen, založení
// dohořením.

const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
const HOME: Position = { x: -60, z: 0, rotation: 0 };
const OCTOBER = dayIndexOf({ year: 600, month: 10, day: 1 });
const JANUARY = dayIndexOf({ year: 601, month: 1, day: 5 });
const JUNE = dayIndexOf({ year: 601, month: 6, day: 1 });

const look = { tree: 'beech-1', youngTree: 'fir-young-1', snag: 'snag-1' } as const;
const obstacle = (
  id: number,
  kind: keyof typeof look,
  x: number,
  z: number,
): ObstaclePlacement => ({ id, kind, look: look[kind], x, z, rotation: 0, scale: 1 });

// čtverec (8, 8) = svět 0–15 m: tři dospělé stromy, souš a mladý stromek; (9, 8) dva stromy
const layer: ObstacleLayer = packObstacles(
  [
    obstacle(1, 'tree', 12, 4),
    obstacle(2, 'tree', 2, 4),
    obstacle(3, 'snag', 6, 6),
    obstacle(4, 'youngTree', 3, 9),
    obstacle(6, 'tree', 7, 12),
    obstacle(7, 'tree', 20, 5),
    obstacle(8, 'tree', 25, 10),
  ],
  16,
  15,
);
const SQUARE_TREES = [1, 2, 3, 4, 6];

function village(day: number, adults = 2): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 11, day, dwellingPosition: HOME }));
  // muži – klučení je stavba pole a staví ji jen muži (population.md – Práce, Stavby staví muži)
  const adult = (id: number): Person => ({
    id,
    bornDay: day - 30 * 366,
    dwellingId: 1,
    sex: 'male',
  });
  s.people = Array.from({ length: adults }, (_, i) => adult(i + 2));
  s.constructions = [];
  s.storesKg = 5000;
  s.woodLogs = 0;
  s.lastDay = day;
  return s;
}

/** Čtverec (8, 8) s pěti stromy – sledovaný díl v lese. */
const isWatched = (p: FieldPart): boolean => p.cell?.x === 8 && p.cell.y === 8;
const watched = (s: VillageState): FieldPart => s.parts.find(isWatched)!;

/**
 * Ves se založeným polem v den `day` – pole má aspoň 1000 m², `cells` výchozí: louka (6–7, 8–9)
 * a les (8, 8) s pěti stromy a (8, 9) bez stromů.
 */
function withForestField(day: number, cells = block(6, 8, 3, 2)): VillageState {
  const s = village(day);
  const preview = fieldPartsFromCells(landscape, placementVillageOf(s, day), cells, [HOME], layer);
  return foundField(s, day, { parts: preview.parts });
}

interface Snap {
  day: number;
  stage: ClearingStage | null;
  felled: number;
  felledDay: number | undefined;
  done: number;
  part: FieldPart;
}

/** Dopočet po dnech s otiskem dílu v lese po každém dni. */
function daily(state: VillageState, toDay: number): { end: VillageState; snaps: Snap[] } {
  let s = state;
  const snaps: Snap[] = [];
  for (let day = s.lastDay + 1; day <= toDay; day++) {
    s = advanceVillage(s, day, layer);
    const part = watched(s);
    snaps.push({
      day,
      stage: clearingStage(part, day),
      felled: part.clearing?.felled ?? -1,
      felledDay: part.clearing?.felledDay,
      done: part.foundingDone,
      part,
    });
  }
  return { end: s, snaps };
}

const lastFell = (snaps: readonly Snap[]): Snap => snaps.find((x) => x.felledDay !== undefined)!;
const founded = (snaps: readonly Snap[]): Snap => snaps.find((x) => x.part.state !== 'founding')!;

describe('klučení po fázích v simulaci', () => {
  it('stromy padají s prací po jednom, nechají pařezy a dospělé dají klády u lesa', () => {
    const start = withForestField(OCTOBER);
    const { snaps } = daily(start, OCTOBER + 20);
    const fell = lastFell(snaps);
    const felledSeries = snaps.filter((x) => x.day <= fell.day).map((x) => x.felled);
    // padá postupně – ne naráz (kácení trvá víc dní) a nikdy neubývá
    expect(new Set(felledSeries).size).toBeGreaterThan(2);
    for (let i = 1; i < felledSeries.length; i++) {
      expect(felledSeries[i]!).toBeGreaterThanOrEqual(felledSeries[i - 1]!);
    }
    for (const x of snaps.filter((y) => y.stage === 'fell')) {
      expect(x.felled).toBe(treesDue(x.part, x.done));
    }
    const s = advanceVillage(start, fell.day, layer);
    expect(watched(s).state).toBe('founding');
    expect(watched(s).foundingDone).toBeCloseTo(clearingFellCost(watched(s)));
    const stumps = obstacleChangesAt(s, fell.day).stumps;
    for (const id of SQUARE_TREES) expect(stumps).toContain(id);
    // tři dospělé stromy = tři klády na hromadě u lesa pole, u vsi nic
    expect(s.logStacks).toHaveLength(1);
    expect(s.logStacks![0]!.fieldId).toBe(watched(s).fieldId);
    expect(s.logStacks![0]!.logs).toBeCloseTo(3, 1);
    // kotva = střed čtverce v krajině sídla (pevná velikost)
    const geo = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M };
    expect(s.logStacks![0]!).toMatchObject(squareCenter(geo, undefined, { x: 8, y: 8 }));
    expect(pileLogs(s)).toBeCloseTo(0, 6);
  });

  it('schne 30 dní a pálí se v červnu hned po schnutí; celková práce = cena lesa', () => {
    const start = withForestField(JUNE);
    const cost = watched(start).foundingCost;
    const fellCost = clearingFellCost(watched(start));
    // 60 % ceny lesa (kameny tu nejsou) je kácení, 40 % pálení
    expect(fellCost / cost).toBeCloseTo(FOREST_CLEARING.fellShare);
    const { end, snaps } = daily(start, JUNE + 60);
    const fell = lastFell(snaps);
    const dry = snaps.filter((x) => x.stage === 'dry');
    expect(dry).toHaveLength(FOREST_CLEARING.dryDays);
    // schnoucí díl práci nebere
    for (const x of dry) expect(x.done).toBeCloseTo(fellCost);
    const burnt = founded(snaps);
    expect(burnt.day - fell.day).toBeGreaterThanOrEqual(FOREST_CLEARING.dryDays);
    expect(burnt.day - fell.day).toBeLessThanOrEqual(FOREST_CLEARING.dryDays + 3);
    expect(burnt.part.burnedDay).toBe(burnt.day);
    expect(end.constructions.some((c) => c.kind === 'field')).toBe(false);
    expect(burnt.part.foundingDone).toBe(cost);
  });

  it('pokácené v lednu se pálí až od 1. března', () => {
    const { snaps } = daily(withForestField(JANUARY), JANUARY + 90);
    const fell = lastFell(snaps);
    expect(dateOfDayIndex(fell.day).month).toBe(1);
    const march = dayIndexOf({ year: 601, month: 3, day: 1 });
    // schnutí skončilo v únoru, pálení přesto čeká na březen (pak má ves i jarní práci na poli)
    expect(snaps.find((x) => x.day === march - 1)!.stage).toBe('dry');
    expect(snaps.find((x) => x.day === march)!.stage).toBe('burn');
    expect(snaps.filter((x) => x.day < march).every((x) => x.part.state === 'founding')).toBe(true);
    const burnt = founded(snaps);
    expect(dateOfDayIndex(burnt.day).month).toBe(3);
  });

  it('dohoření odstraní překážky a pařezy a spustí bonus popela od dne dohoření', () => {
    const { end, snaps } = daily(withForestField(JUNE), JUNE + 60);
    const burnt = founded(snaps);
    const part = watched(end);
    expect(part.state).toBe('ready');
    expect(part.clearing).toBeUndefined();
    expect(part.obstacles).toBeUndefined();
    expect(part.bonusUntilDay).toBe(forestBonusUntil(burnt.day));
    const changes = obstacleChangesAt(end, end.lastDay);
    for (const id of SQUARE_TREES) expect(changes.removed).toContain(id);
    expect((end.felledTrees ?? []).some((f) => SQUARE_TREES.includes(f.id))).toBe(false);
    // pařezy doutnají 2 dny od dohoření
    expect(isSmoldering(part, burnt.day)).toBe(true);
    expect(isSmoldering(part, burnt.day + FOREST_CLEARING.smolderDays - 1)).toBe(true);
    expect(isSmoldering(part, burnt.day + FOREST_CLEARING.smolderDays)).toBe(false);
  });

  it('po kouscích stejně jako najednou – přes kácení, schnutí i pálení', () => {
    const start = withForestField(OCTOBER, block(6, 8, 4, 2));
    const to = OCTOBER + 200;
    const whole = advanceVillage(start, to, layer);
    const forest = whole.parts.filter((p) => p.surface === 'forest');
    expect(forest).toHaveLength(4);
    expect(forest.every((p) => p.state !== 'founding' && p.burnedDay !== undefined)).toBe(true);
    for (const step of [7, 30]) {
      let s = start;
      for (let day = OCTOBER + step; day < to; day += step) s = advanceVillage(s, day, layer);
      s = advanceVillage(s, to, layer);
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole));
    }
    expect(JSON.stringify(daily(start, to).end)).toBe(JSON.stringify(whole));
  });

  it('hromada pole u cesty nejblíž místu kácení – po kouscích stejně jako najednou', () => {
    const start = withForestField(OCTOBER, block(6, 8, 4, 2));
    // cesta 45 m od středu čtverce (8, 8) – čtverce lesa pole jsou do 60 m od ní
    const corner = partCenter(
      start,
      start.parts.find((p) => p.cell?.x === 8 && p.cell.y === 8)!,
    )!;
    const roadZ = corner.z + 45;
    start.roads = {
      nextId: 2,
      roads: [
        {
          id: 1,
          points: [
            { x: corner.x - 200, z: roadZ },
            { x: corner.x + 200, z: roadZ },
          ],
          bornDay: 0,
          grade: 'trodden',
          traffic: [],
          spots: [],
        },
      ],
      trees: [],
      labor: { from: 0, days: 0, shares: [] },
    };
    const to = OCTOBER + 60;
    const whole = advanceVillage(start, to, layer);
    const stacks = whole.logStacks ?? [];
    expect(stacks).toHaveLength(1);
    const stack = stacks[0]!;
    expect(stack.road?.z).toBe(roadZ);
    expect(stack.z).toBe(roadZ - LOG_PILES.roadSideM);
    // u čtverce, na kterém padl první dospělý strom (kraj lesa nejblíž vsi – x = 8)
    expect(stack.x).toBe(corner.x);
    for (const step of [5, 23]) {
      let s = start;
      for (let day = OCTOBER + step; day < to; day += step) s = advanceVillage(s, day, layer);
      s = advanceVillage(s, to, layer);
      expect(JSON.stringify(s)).toBe(JSON.stringify(whole));
    }
  });
});

describe('rozdělení práce pole', () => {
  it('celá potřeba dne (`completes`) dokončí jen kácení – díl pak schne, nezaloží se', () => {
    const s = withForestField(OCTOBER);
    const c = s.constructions.find((x) => x.kind === 'field')!;
    const day = OCTOBER + 1;
    const need = constructionNeed(s, c, day, foundingIndex(s));
    expect(need).toBeGreaterThan(clearingFellCost(watched(s)));
    invest(s, day, c, need, true, foundingIndex(s));
    const part = watched(s);
    expect(part.state).toBe('founding');
    expect(part.clearing!.felled).toBe(5);
    expect(part.clearing!.felledDay).toBe(day);
    expect(clearingStage(part, day + 1)).toBe('dry');
    expect(constructionNeed(s, c, day + 1, foundingIndex(s))).toBe(0);
  });

  it('pálení má přednost před kácením, schnoucí díl práci nebere – jde do jiné stavby', () => {
    const s = withForestField(JUNE);
    const c = s.constructions.find((x) => x.kind === 'field')!;
    // louka je už založená, zbývají dva díly v lese
    for (const p of s.parts) if (p.surface !== 'forest') p.state = 'ready';
    const [near, far] = s.parts
      .filter((p) => p.surface === 'forest')
      .sort((a, b) => a.distanceM - b.distanceM);
    // bližší díl je pokácený a suchý (pálí se), vzdálenější se kácí
    near!.foundingDone = clearingFellCost(near!);
    near!.clearing!.felled = near!.clearing!.fell.length;
    near!.clearing!.felledDay = JUNE - FOREST_CLEARING.dryDays;
    const burnNeed = near!.foundingCost - near!.foundingDone;
    invest(s, JUNE, c, burnNeed + 0.5, false, foundingIndex(s));
    expect(near!.state).toBe('ready');
    expect(near!.burnedDay).toBe(JUNE);
    expect(far!.foundingDone).toBeCloseTo(0.5);

    // vzdálenější díl dokácen – schne; pole nic nepotřebuje, práce jde do jiné stavby
    const other: Construction = {
      id: 999,
      kind: 'ard',
      startedDay: JUNE,
      cost: 10,
      done: 0,
      dwellingType: null,
      position: null,
      dwellingId: null,
      fieldId: null,
    };
    s.constructions.push(other);
    invest(s, JUNE + 1, c, clearingFellCost(far!), true, foundingIndex(s));
    expect(clearingStage(far!, JUNE + 2)).toBe('dry');
    const work = build(s, JUNE + 2, 3);
    expect(work.map((w) => w.construction.id)).toEqual([999]);
    expect(work[0]!.manDays).toBeCloseTo(3);
  });
});

describe('vzhled dílu v lese', () => {
  it('kácení a schnutí paseka, pálení spálenina přes paseku, po dohoření spálenina', () => {
    const { snaps } = daily(withForestField(JUNE), JUNE + 60);
    for (const x of snaps) {
      const s = { ...withForestField(JUNE), parts: [x.part] };
      const view = fieldPartLooks(s, x.day).get(x.part.id);
      if (x.stage === 'fell' || x.stage === 'dry') expect(view?.look).toBe('slash');
      if (x.stage === 'burn') expect(view).toMatchObject({ look: 'burnt', before: 'slash' });
      if (x.part.state === 'ready') expect(view?.look).toBe('burnt');
    }
    const fell = snaps.find((x) => x.stage === 'fell' && x.felled > 0 && x.felled < 5);
    if (fell) {
      const s = { ...withForestField(JUNE), parts: [fell.part] };
      expect(fieldPartLooks(s, fell.day).get(fell.part.id)!.work).toBeGreaterThan(0);
    }
  });
});
