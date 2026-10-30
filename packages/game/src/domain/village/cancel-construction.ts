import { validateActionDay } from './actions';
import { refundHorsePen } from './horse-pen-payment';
import { villageCemeteries } from './cemetery';
import { villageOrchards } from './orchard';
import { villagePens } from './oxen';
import { returnConstructionWood } from './relocation';
import { roadUpgradeProgress } from './road-upgrades';
import { villageThreshingFloors } from './threshing-floors';
import { STEWARD } from './rules-steward';
import type { GridGeometry } from './square-grid';
import { isStewardBuilt } from './steward-state';
import { bypassedUpTo } from './wagon-road';
import type { StewardPlanKind, StewardVeto } from './types-steward';
import type { Construction, ConstructionKind, RoadEarthwork, VillageState } from './types';

const DAYS_PER_YEAR = 365;

// Zrušení rozestavěné stavby (Martin 23. 10. 2026: „Potřebuju mít možnost stavbu zrušit.“):
// jen rozestavěná stavba, kterou začal hráč – vytýčení zmizí a práce na ní skončí. Nespotřebované
// dřevo se vrátí na hromadu (`returnConstructionWood`), odvedená práce, zabudovaný materiál,
// odstraněné překážky a pole či sady, které stavba zmenšila, propadnou. Návrh Claude: automatické
// stavby vesničanů (přestavba, obnova sadu, oprava, rádlo), zemská stezka a první zemnice
// zakladatelů se nerozhodují zde. Rozdělaná úprava cesty a vozová cesta (Úloha 10b plánu cest v2)
// se zruší tak, že hotové úseky zůstanou.

/** Druhy staveb, které hráč zakládá a jde je zrušit. */
const CANCELLABLE: ReadonlySet<ConstructionKind> = new Set([
  'dwelling',
  'field',
  'cemetery',
  'orchard',
  'idol',
  'shrine',
  'pen',
  'threshing-floor',
  'road',
]);

/** Důvod, proč stavbu zrušit nejde; null = jde. */
export function cancelBlock(c: Construction): string | null {
  if (!CANCELLABLE.has(c.kind) || c.renewal) return 'Tuhle stavbu zrušit nejde.';
  // zemská stezka není úprava cesty hráče
  if (c.kind === 'road' && c.trail !== undefined) return 'Tuhle stavbu zrušit nejde.';
  // první zemnice zakladatelů: bez ní by lidé neměli kde bydlet
  if (c.kind === 'dwelling' && c.dwellingId !== null && c.relocates === undefined) {
    return 'První zemnici zakladatelů zrušit nejde.';
  }
  return null;
}

/** Jde stavba zrušit? */
export function isCancellable(c: Construction): boolean {
  return cancelBlock(c) === null;
}

/** Odstraní z klonu stavu vše, co vytýčení stavby `c` zabíralo (bez dřeva a stavby samotné). */
function dropSite(next: VillageState, c: Construction): void {
  if (c.kind === 'field') {
    next.parts = next.parts.filter((p) => !(p.fieldId === c.fieldId && p.state === 'founding'));
  } else if (c.kind === 'orchard') {
    const orchards = villageOrchards(next);
    for (const o of orchards) {
      if (o.id === c.orchardId) {
        o.squares = o.squares.filter((s) => s.plantedDay !== null || s.renewal !== undefined);
      }
    }
    next.orchards = orchards.filter((o) => o.squares.length > 0);
  } else if (c.kind === 'cemetery') {
    dropCemetery(next, c);
  } else if (c.kind === 'pen') {
    dropPen(next, c);
  } else if (c.kind === 'threshing-floor') {
    next.threshingFloors = villageThreshingFloors(next).filter((f) => f.id !== c.id);
  } else if (c.kind === 'road') {
    if (c.earthwork !== undefined) dropWagonRoad(next, c);
    else dropRoadUpgrade(next, c);
  }
}

/**
 * Úprava cesty (roads.md – Vylepšení cesty): úseky, na které práce došla, zůstanou upravené (hotové
 * se nebourají), rozdělaný úsek a zbytek cesty zůstanou v dosavadním druhu.
 */
function dropRoadUpgrade(next: VillageState, c: Construction): void {
  if (!c.roadGrade) return;
  const progress = roadUpgradeProgress(next, c, c.cost > 0 ? Math.min(1, c.done / c.cost) : 0);
  for (const road of next.roads?.roads ?? []) {
    if ((progress.get(road.id) ?? 0) < 1) continue;
    road.grade = c.roadGrade;
    delete road.unbridged;
  }
}

/**
 * Vozová cesta ve stavbě: hotové úseky (už jsou vozovou cestou) i s upraveným terénem zůstanou,
 * zemní práce se zkrátí na ně; rozdělaný úsek a zbytek osy zmizí. Bez hotového úseku zmizí
 * zemní práce celé.
 */
function dropWagonRoad(next: VillageState, c: Construction): void {
  const earthworks = next.roads?.earthworks;
  const earthwork = earthworks?.find((e) => e.id === c.earthwork);
  if (!next.roads || !earthworks || !earthwork) return;
  const built = earthwork.pieces.filter((p) => p.builtDay !== null);
  if (built.length === 0) {
    next.roads.earthworks = earthworks.filter((e) => e.id !== earthwork.id);
    return;
  }
  const builtM = built[built.length - 1]!.toM;
  // obejité kusy, které hotová část nenahradila, se nechají být (jejich stará cesta žije dál)
  const passed = bypassedUpTo(earthwork, builtM);
  if (passed.length > 0) earthwork.bypassed = passed;
  else delete earthwork.bypassed;
  trimEarthwork(earthwork, builtM);
  earthwork.pieces = built;
  delete earthwork.constructionId;
}

/** Zkrátí osu zemních prací na `toM` m od začátku (poslední bod na řezu, výška se doplní). */
function trimEarthwork(earthwork: RoadEarthwork, toM: number): void {
  const kept = [earthwork.profile[0]!];
  let along = 0;
  for (let k = 1; k < earthwork.profile.length; k++) {
    const a = earthwork.profile[k - 1]!;
    const b = earthwork.profile[k]!;
    const length = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
    if (along + length <= toM + 1e-6) {
      kept.push(b);
      along += length;
      continue;
    }
    const u = length > 0 ? Math.max(0, (toM - along) / length) : 0;
    if (u > 1e-6) {
      const round = (v: number): number => Math.round(v * 100) / 100;
      kept.push({
        x: round(a.x + (b.x - a.x) * u),
        z: round(a.z + (b.z - a.z) * u),
        y: round(a.y + (b.y - a.y) * u),
      });
    }
    break;
  }
  earthwork.profile = kept;
  if (earthwork.fords) {
    const fords = earthwork.fords.filter((i) => i < kept.length);
    if (fords.length > 0) earthwork.fords = fords;
    else delete earthwork.fords;
  }
}

/**
 * Hřbitov: rozšíření ztratí své čtverce; nehotový hřbitov (základ, `builtDay` null) zmizí celý
 * i s rozšířeními, která na něj navazovaly – ta se zruší s ním. Hotový hřbitov (hroby) se nikdy
 * nemaže: když stavba nenese žádné čtverce, nestane se nic.
 */
function dropCemetery(next: VillageState, c: Construction): void {
  const cemeteries = villageCemeteries(next);
  const cemetery = cemeteries.find((x) => x.id === c.cemeteryId);
  if (!cemetery) return;
  if (cemetery.squares.some((s) => s.constructionId === c.id)) {
    cemetery.squares = cemetery.squares.filter((s) => s.constructionId !== c.id);
    return;
  }
  if (cemetery.builtDay !== null) return;
  next.cemeteries = cemeteries.filter((x) => x.id !== cemetery.id);
  dropLinked(next, (x) => x.kind === 'cemetery' && x.cemeteryId === cemetery.id && x.id !== c.id);
}

/**
 * Ohrada: rozšíření ztratí své čtverce; nehotová ohrada (`builtDay` null) zmizí celá i s navazujícími
 * rozšířeními. Hotová ohrada (zvířata) se nikdy nemaže: bez čtverců stavby se nestane nic.
 */
function dropPen(next: VillageState, c: Construction): void {
  const pens = villagePens(next);
  const pen = pens.find((x) => x.id === c.penId);
  if (!pen) return;
  if ((pen.extraSquares ?? []).some((q) => q.constructionId === c.id)) {
    pen.extraSquares = (pen.extraSquares ?? []).filter((q) => q.constructionId !== c.id);
    if (pen.extraSquares.length === 0) delete pen.extraSquares;
    return;
  }
  if (pen.builtDay !== null) return;
  next.pens = pens.filter((x) => x.id !== pen.id);
  dropLinked(next, (x) => x.kind === 'pen' && x.penId === pen.id && x.id !== c.id);
}

/** Zruší s nadřazenou stavbou i stavby, které na ni navazují (vrátí jim dřevo). */
function dropLinked(next: VillageState, linked: (x: Construction) => boolean): void {
  for (const x of next.constructions.filter(linked)) returnConstructionWood(next, x);
  next.constructions = next.constructions.filter((x) => !linked(x));
}

/** Druh stavby pro veto správce a políčka, která stavba zabírala (před `dropSite`). */
function vetoSites(
  state: VillageState,
  c: Construction,
  geo: GridGeometry,
): { kind: StewardPlanKind; cells: { x: number; y: number }[] } | null {
  const tileOf = (x: number, z: number): { x: number; y: number } => {
    const half = (geo.size * geo.cellSizeM) / 2;
    return {
      x: Math.floor((x + half) / geo.cellSizeM),
      y: Math.floor((z + half) / geo.cellSizeM),
    };
  };
  const plain = (
    list: readonly { cell: { x: number; y: number } }[],
    grid: unknown,
  ): { x: number; y: number }[] => (grid ? [] : list.map((q) => ({ x: q.cell.x, y: q.cell.y })));
  switch (c.kind) {
    case 'dwelling':
      return c.position
        ? { kind: c.craft ? 'workshop' : 'dwelling', cells: [tileOf(c.position.x, c.position.z)] }
        : null;
    case 'threshing-floor':
      return c.position
        ? { kind: 'threshing-floor', cells: [tileOf(c.position.x, c.position.z)] }
        : null;
    case 'field':
      return {
        kind: 'field',
        cells: state.parts
          .filter((p) => p.fieldId === c.fieldId && p.state === 'founding' && p.cell)
          .flatMap((p) => {
            const grid = state.fields.find((f) => f.id === p.fieldId)?.grid;
            return plain([{ cell: p.cell! }], grid);
          }),
      };
    case 'orchard': {
      const o = villageOrchards(state).find((x) => x.id === c.orchardId);
      return o
        ? {
            kind: 'orchard',
            cells: plain(
              o.squares.filter((s) => s.plantedDay === null),
              o.grid,
            ),
          }
        : null;
    }
    case 'cemetery': {
      const x = villageCemeteries(state).find((e) => e.id === c.cemeteryId);
      if (!x) return null;
      const own = x.squares.filter((s) => s.constructionId === c.id);
      return { kind: 'cemetery', cells: plain(own.length > 0 ? own : x.squares, x.grid) };
    }
    case 'pen': {
      const p = villagePens(state).find((e) => e.id === c.penId);
      if (!p) return null;
      const own = (p.extraSquares ?? []).filter((q) => q.constructionId === c.id);
      return { kind: 'pen', cells: plain(own.length > 0 ? own : [{ cell: p.cell }], p.grid) };
    }
    default:
      return null;
  }
}

/**
 * Hráč zruší rozestavěnou stavbu `constructionId`: vytýčení zmizí (nehotové díly pole, čtverce
 * sadu, hřbitova a ohrady, humno), práce na ní skončí a nespotřebované dřevo se vrátí na hromadu.
 * Rozestavěné přestěhování se v kronice zapíše jako zrušené stěhování. RangeError, když taková
 * stavba není (dostavěná) nebo ji zrušit nejde (`cancelBlock`), nebo pro den do minulosti vsi.
 * Vstupní stav se nemění.
 */
export function cancelConstruction(
  state: VillageState,
  day: number,
  constructionId: number,
  geo?: GridGeometry,
): VillageState {
  validateActionDay(state, day);
  const c = state.constructions.find((x) => x.id === constructionId);
  if (!c) throw new RangeError(`Stavba ${constructionId} není rozestavěná.`);
  const block = cancelBlock(c);
  if (block !== null) throw new RangeError(block);
  const next = structuredClone(state);
  const target = next.constructions.find((x) => x.id === constructionId);
  if (!target) throw new RangeError(`Stavba ${constructionId} není rozestavěná.`);
  // stavba správce: veto – tentýž druh na těch políčkách se `STEWARD.vetoYears` nestaví
  // (steward.md – Soužití s hráčem); krajina dá políčka, bez ní veto nevznikne
  const veto = geo && isStewardBuilt(state, c.id) ? vetoSites(state, c, geo) : null;
  // zrušené stěhování: veto i na zdrojový dům, aby ho správce přestavěl na místě, ne stěhoval jinam
  if (veto && geo && c.relocates !== undefined) {
    const source = state.dwellings.find((x) => x.id === c.relocates);
    if (source) {
      const half = (geo.size * geo.cellSizeM) / 2;
      veto.cells.push({
        x: Math.floor((source.position.x + half) / geo.cellSizeM),
        y: Math.floor((source.position.z + half) / geo.cellSizeM),
      });
    }
  }
  returnConstructionWood(next, target);
  // vrátí se přesně to, čím ves zaplatila koně ohrady (horses.md – Koně se stavbou ohrady)
  if (target.horsePenPaid) refundHorsePen(next, target.horsePenPaid, day);
  dropSite(next, target);
  next.constructions = next.constructions.filter((x) => x.id !== constructionId);
  if (veto && veto.cells.length > 0 && next.steward) {
    const untilDay = day + STEWARD.vetoYears * DAYS_PER_YEAR;
    const kept = (next.steward.vetoes ?? []).filter((v) => v.untilDay >= day);
    const added: StewardVeto[] = veto.cells.map((cell) => ({ kind: veto.kind, cell, untilDay }));
    next.steward.vetoes = [...kept, ...added];
  }
  next.chronicle.push(
    target.relocates === undefined
      ? {
          day,
          kind: 'construction-cancelled',
          constructionKind: target.kind,
          ...(target.craft ? { craft: target.craft } : {}),
        }
      : { day, kind: 'relocation-cancelled', dwellingId: target.relocates },
  );
  return next;
}
