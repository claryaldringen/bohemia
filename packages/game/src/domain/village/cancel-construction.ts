import { validateActionDay } from './actions';
import { villageCemeteries } from './cemetery';
import { villageOrchards } from './orchard';
import { villagePens } from './oxen';
import { returnConstructionWood } from './relocation';
import { villageThreshingFloors } from './threshing-floors';
import type { Construction, ConstructionKind, VillageState } from './types';

// Zrušení rozestavěné stavby (Martin 23. 10. 2026: „Potřebuju mít možnost stavbu zrušit.“):
// jen rozestavěná stavba, kterou začal hráč – vytýčení zmizí a práce na ní skončí. Nespotřebované
// dřevo se vrátí na hromadu (`returnConstructionWood`), odvedená práce, zabudovaný materiál,
// odstraněné překážky a pole či sady, které stavba zmenšila, propadnou. Návrh Claude: automatické
// stavby vesničanů (přestavba, obnova sadu, oprava, rádlo), cesty a první zemnice zakladatelů
// se nerozhodují zde.

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
]);

/** Důvod, proč stavbu zrušit nejde; null = jde. */
export function cancelBlock(c: Construction): string | null {
  if (!CANCELLABLE.has(c.kind) || c.renewal) return 'Tuhle stavbu zrušit nejde.';
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
): VillageState {
  validateActionDay(state, day);
  const c = state.constructions.find((x) => x.id === constructionId);
  if (!c) throw new RangeError(`Stavba ${constructionId} není rozestavěná.`);
  const block = cancelBlock(c);
  if (block !== null) throw new RangeError(block);
  const next = structuredClone(state);
  const target = next.constructions.find((x) => x.id === constructionId);
  if (!target) throw new RangeError(`Stavba ${constructionId} není rozestavěná.`);
  returnConstructionWood(next, target);
  dropSite(next, target);
  next.constructions = next.constructions.filter((x) => x.id !== constructionId);
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
