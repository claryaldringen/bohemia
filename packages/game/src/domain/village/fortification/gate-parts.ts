import { segmentKind, segmentWall } from './life';
import { FORT_GATE_HALF_M } from './section-spans';
import type { FortGatePart, FortSegment, Fortification } from './types';

// Části dílu s branou (fortifications.md – Úseky a brány; Martin 8. 11. 2026: „Hradba je hradba,
// brána je brána.“): úsek mezi branami sahá přesně po okraj brány, díl s branou má proto kus
// hradby před bránou, bránu a kus hradby za bránou. Vylepšení úseku postaví novou hradbu jen na
// kusu svého úseku – kus dostane vlastní vrstvy (`FortSegment.beforeGate` / `afterGate`), vrstvy
// dílu dál drží bránu a kus bez vlastní hradby (návrh Clauda). Kdo čte hradbu v místě, čte kus
// podle polohy (`gatePartView`). Díly bez vlastních vrstev kusů se čtou beze změny.

/** Kus dílu s branou – před bránou (od začátku dílu), nebo za ní (po konec dílu). */
export type GatePart = 'before' | 'after';

/** Oba kusy dílu s branou v pořadí obvodu. */
export const GATE_PARTS: readonly GatePart[] = ['before', 'after'];

/** Pole vrstev hradby, která kus dílu s branou drží zvlášť (`FortGatePart`). */
const PART_FIELDS = [
  'kind',
  'top',
  'builtDay',
  'topBuiltDay',
  'state',
  'extraAgeDays',
  'rampartOutside',
  'rampartHeight',
  'moatDay',
] as const;

/** Díl, jak ho kusy u brány potřebují znát (stav vsi i pohled scény). */
export interface GatePartSource {
  readonly builtDay: number | null;
  readonly demolishedDay?: number;
  readonly demolishedBeforeGate?: number;
  readonly demolishedAfterGate?: number;
  readonly beforeGate?: FortGatePart;
  readonly afterGate?: FortGatePart;
}

/** Vlastní vrstvy kusu `part` dílu, nebo undefined (kus má hradbu dílu). */
export function ownGatePart(seg: GatePartSource, part: GatePart): FortGatePart | undefined {
  return part === 'before' ? seg.beforeGate : seg.afterGate;
}

/** Den zboření kusu `part` dílu se zbořeným sousedním úsekem, nebo undefined. */
export function gonePartDay(seg: GatePartSource, part: GatePart): number | undefined {
  return part === 'before' ? seg.demolishedBeforeGate : seg.demolishedAfterGate;
}

/** Má díl kus s vlastní hradbou (jinou než díl)? */
export function hasGateParts(seg: GatePartSource): boolean {
  return seg.beforeGate !== undefined || seg.afterGate !== undefined;
}

/** Druhý kus dílu s branou. */
export function otherGatePart(part: GatePart): GatePart {
  return part === 'before' ? 'after' : 'before';
}

/** Kus dílu s branou, ve kterém leží místo `alongM` m od začátku dílu (brána uprostřed `gateM`). */
export function gatePartAt(gateM: number, alongM: number): GatePart {
  return alongM < gateM ? 'before' : 'after';
}

/** Délka kusu `part` dílu délky `lengthM` s bránou v `gateM` m od začátku dílu – bez brány. */
export function gatePartLengthM(lengthM: number, gateM: number, part: GatePart): number {
  return Math.max(
    0,
    part === 'before' ? gateM - FORT_GATE_HALF_M : lengthM - gateM - FORT_GATE_HALF_M,
  );
}

/** Kopie dílu s vrstvami kusu `part` – bez vlastních vrstev kusů, zboření kusů zůstává. */
function withPartLayers<S extends GatePartSource>(seg: S, part: GatePart): Record<string, unknown> {
  const view = { ...seg } as unknown as Record<string, unknown>;
  delete view.beforeGate;
  delete view.afterGate;
  const own = ownGatePart(seg, part);
  if (own) {
    for (const f of PART_FIELDS) {
      if (own[f] === undefined) delete view[f];
      else view[f] = own[f];
    }
  }
  return view;
}

/**
 * Díl, jak vypadá jeho kus `part` u brány – vždy kopie: vrstvy kusu (`beforeGate` / `afterGate`),
 * jinak vrstvy dílu; kus zbořený se sousedním úsekem je zbořený díl (`demolishedDay`, stav 0).
 * Celý zbořený či prolomený díl platí i pro kus. Zápis zpět – `storeGatePart`.
 */
export function gatePartView<S extends GatePartSource>(seg: S, part: GatePart): S {
  const view = withPartLayers(seg, part);
  delete view.demolishedBeforeGate;
  delete view.demolishedAfterGate;
  const gone = gonePartDay(seg, part);
  if (gone !== undefined && seg.demolishedDay === undefined) {
    view.demolishedDay = gone;
    view.state = 0;
  }
  return view as S;
}

/**
 * Díl po kusech pro čtení, které bere díl jako celek (stěny pochodu, bitva): díl bez kusů
 * s vlastní hradbou sám; jinak kus před bránou a kus za ní, každý s vrstvami svého kusu a s druhým
 * kusem jako zbořeným (`demolished…Gate`) – stěny (`fortWalls`) z něj vezmou jen jeho kus a bránu.
 */
export function gatePartPieces<S extends GatePartSource>(seg: S): S[] {
  if (!hasGateParts(seg)) return [seg];
  return GATE_PARTS.map((part) => {
    const piece = withPartLayers(seg, part);
    const other = otherGatePart(part);
    if (other === 'before') piece.demolishedBeforeGate = seg.demolishedBeforeGate ?? 0;
    else piece.demolishedAfterGate = seg.demolishedAfterGate ?? 0;
    return piece as S;
  });
}

/** Vrstvy hradby kusu z pohledu (`FortGatePart`) – jen pole, která pohled má. */
function partLayers(view: FortSegment): FortGatePart {
  const own: Record<string, unknown> = {};
  for (const f of PART_FIELDS) if (view[f] !== undefined) own[f] = view[f];
  return own as unknown as FortGatePart;
}

/** Má kus tytéž vrstvy hradby jako díl (vlastní vrstvy jsou zbytečné)? */
function sameLayers(seg: FortSegment, own: FortGatePart): boolean {
  return PART_FIELDS.every((f) => seg[f] === own[f]);
}

/** Uloží vrstvy kusu `part` (mutuje díl); shodné s dílem se neukládají. */
function setOwn(seg: FortSegment, part: GatePart, own: FortGatePart): void {
  const key = part === 'before' ? 'beforeGate' : 'afterGate';
  if (sameLayers(seg, own)) delete seg[key];
  else seg[key] = own;
}

/**
 * Hradba v místě – druh základu, hradby a val vně (bez stáří); zbořený kus a kus, jehož základ
 * se teprve staví (val doplňovaný pod hradbu), null.
 */
function wallSign(fort: Pick<Fortification, 'kind' | 'top'>, seg: FortSegment): string | null {
  if (seg.demolishedDay !== undefined || seg.builtDay === null) return null;
  const outside = seg.rampartOutside === true ? ':o' : '';
  return `${segmentKind(fort, seg)}:${segmentWall(fort, seg)?.kind ?? ''}${outside}`;
}

/**
 * Zapíše pohled kusu `part` zpět do dílu (mutuje díl): vrstvy hradby kusu (shodné s dílem se
 * neukládají) a postavený kus už není zbořený. Mají-li pak oba kusy stejnou hradbu a brána (vrstvy
 * dílu) jinou, brána ji převezme od tohoto kusu – brána stojí v hradbě kolem sebe; druhý kus si
 * nechá své vrstvy (stáří), jen pokud se liší (návrh Clauda).
 */
export function storeGatePart(
  fort: Pick<Fortification, 'kind' | 'top'>,
  seg: FortSegment,
  part: GatePart,
  view: FortSegment,
): void {
  if (view.demolishedDay === undefined) {
    if (part === 'before') delete seg.demolishedBeforeGate;
    else delete seg.demolishedAfterGate;
  }
  const own = partLayers(view);
  setOwn(seg, part, own);
  const other = otherGatePart(part);
  const theirs = gatePartView(seg, other);
  const sign = wallSign(fort, view);
  if (sign === null || sign !== wallSign(fort, theirs) || sign === wallSign(fort, seg)) return;
  const keep = partLayers(theirs);
  for (const f of PART_FIELDS) {
    const value = own[f];
    if (value === undefined) delete seg[f];
    else (seg as unknown as Record<string, unknown>)[f] = value;
  }
  delete seg[part === 'before' ? 'beforeGate' : 'afterGate'];
  setOwn(seg, other, keep);
}

/**
 * Vrstvy hradby kusů po změně druhu opevnění (`settleUpgrade` – mutuje díl): druh rovný druhu
 * opevnění se neukládá, opevnění bez valu nemá nástavbu; kusy shodné s dílem zmizí.
 */
export function settleGateParts(fort: Pick<Fortification, 'kind'>, seg: FortSegment): void {
  for (const part of GATE_PARTS) {
    const own = ownGatePart(seg, part);
    if (!own) continue;
    const next: FortGatePart = { ...own };
    if (next.kind === fort.kind) delete next.kind;
    if (fort.kind !== 'rampart') {
      delete next.top;
      delete next.topBuiltDay;
    }
    setOwn(seg, part, next);
  }
}

/**
 * Díl, jak ho čte místo prolomení hradby v bitvě (`battle.ts` – delší kus dílu s branou: brána za
 * polovinou dílu – kus před ní, jinak za ní): kus s vlastní hradbou podle sebe, jinak díl.
 */
export function wallSpotSegment<S extends GatePartSource & { readonly index: number }>(
  gates: readonly { readonly segment: number; readonly offsetM: number }[],
  seg: S,
  lengthM: number,
): S {
  const gate = gates.find((g) => g.segment === seg.index);
  if (!gate || !hasGateParts(seg)) return seg;
  return gatePartView(seg, gate.offsetM > lengthM / 2 ? 'before' : 'after');
}
