import { readySquares, villageCemeteries } from './cemetery';
import { sacredBuildLabor } from './costs';
import { builtPenSquares, penSpecies } from './pens';
import { fencedSquareEquivalents, outerFenceSides, SQUARE_SIDES } from './fence-cost';
import { penBuildLabor, villagePens } from './oxen';
import { CEMETERY, PEN_FENCE, STRUCTURE_REPAIR } from './rules';
import type {
  AbandonedStructure,
  ChronicleEvent,
  Construction,
  StructureWear,
  VillageState,
} from './types';

// Oprava staveb, ke kterým se zase chodí (docs/design/abandonment.md – Oprava; Martin 19. 10.
// 2026: plot hřbitova vesničané opraví sami, jakmile se ke hřbitovu zase chodí – postupně z práce
// vsi, spadlý postaví znovu; „ano“ i pro modlu, svatyni a ohradu). Roční kontrola cest (1. 11.)
// zastaví chátrání navštěvované stavby a stavbě pod plným stavem založí opravu – stavbu ze
// společné práce jako obnova sadu (nečeká na hráče ani na suroviny). Stav stavby roste s prací
// (`StructureWear.condition`), po dokončení záznam chátrání zmizí. Když stavbu pozdější kontrola
// uzná za opuštěnou, oprava se zruší – co vesničané spravili, zůstane a chátrá od toho stavu.
// Opravuje se jen stojící stavba: padlá modla, svatyně a ohrada zmizely (staví se znovu), plot
// hřbitova se postaví znovu i spadlý (hřbitov dál stojí). Modul nezávisí na abandonment.ts.

/** Stavba, kterou jde opravit – druh a id (modla a svatyně id stavby, hřbitov, ohrada). */
export interface StructureRef {
  structure: AbandonedStructure;
  id: number;
}

/** Přístup k záznamu chátrání stavby (u hřbitova `fenceWear`, jinak `wear`). */
interface WearSlot {
  get(): StructureWear | undefined;
  set(wear: StructureWear | undefined): void;
}

/** Záznam chátrání stavby; stavba, která nestojí (padlá modla, zmizelá ohrada), null. */
function wearSlot(state: VillageState, ref: StructureRef): WearSlot | null {
  if (ref.structure === 'cemetery-fence') {
    const c = villageCemeteries(state).find((x) => x.id === ref.id);
    if (!c) return null;
    return {
      get: () => c.fenceWear,
      set: (wear) => {
        if (wear) c.fenceWear = wear;
        else delete c.fenceWear;
      },
    };
  }
  const target =
    ref.structure === 'pen'
      ? villagePens(state).find((p) => p.id === ref.id)
      : (state.sacredBuildings ?? []).find((b) => b.id === ref.id && b.kind === ref.structure);
  if (!target) return null;
  return {
    get: () => target.wear,
    set: (wear) => {
      if (wear) target.wear = wear;
      else delete target.wear;
    },
  };
}

/**
 * Plná oprava stavby ze stavu 0 (člověkodny): podíl `STRUCTURE_REPAIR.share` z ceny stavby bez
 * kácení – modla a svatyně bez kácení dubů, ohrada bez kácení stromů, plot hřbitova z vytyčení
 * a ohrazení hotových čtverců. Stavba, která nestojí, 0.
 */
export function fullRepairManDays(state: VillageState, ref: StructureRef): number {
  const share = STRUCTURE_REPAIR.share[ref.structure];
  if (ref.structure === 'cemetery-fence') {
    const c = villageCemeteries(state).find((x) => x.id === ref.id);
    // plot jen po vnějších stranách obrysu (cemetery.md – Plot hřbitova podle délky)
    return c
      ? (share *
          CEMETERY.costPerSquare *
          outerFenceSides(readySquares(c.squares).map((q) => q.cell))) /
          SQUARE_SIDES
      : 0;
  }
  if (ref.structure === 'pen') {
    // plot a přístřešek po hotových čtvercích (oxen.md – Ohrady podle druhu)
    const pen = villagePens(state).find((p) => p.id === ref.id);
    if (!pen) return 0;
    const cells = builtPenSquares(pen).map((q) => q.cell);
    return (
      share *
      penBuildLabor(penSpecies(pen)) *
      (cells.length === 0
        ? 1
        : fencedSquareEquivalents(cells.length, outerFenceSides(cells), PEN_FENCE.share))
    );
  }
  const kind = ref.structure;
  const stands = (state.sacredBuildings ?? []).some((b) => b.id === ref.id && b.kind === kind);
  return stands ? share * sacredBuildLabor(kind) : 0;
}

/** Rozestavěná oprava stavby, nebo undefined. */
export function repairOf(
  state: Pick<VillageState, 'constructions'>,
  ref: StructureRef,
): Construction | undefined {
  return state.constructions.find(
    (c) => c.kind === 'repair' && c.repair?.structure === ref.structure && c.repair.id === ref.id,
  );
}

/**
 * Založí opravu stavby se stavem `condition` (mutuje stav – roční kontrola, ohrada, do které se
 * vrátila zvířata): stavba ze společné práce, práce = plná oprava × chybějící stav. Celá stavba,
 * stavba, která nestojí, a stavba, která se už opravuje, nic.
 */
export function startRepair(
  state: VillageState,
  day: number,
  ref: StructureRef,
  condition: number,
): void {
  if (condition >= 1 || repairOf(state, ref)) return;
  const cost = fullRepairManDays(state, ref) * (1 - Math.max(0, condition));
  if (cost <= 0) return;
  state.constructions.push({
    id: state.nextId++,
    kind: 'repair',
    startedDay: day,
    cost,
    done: 0,
    dwellingType: null,
    position: null,
    dwellingId: null,
    fieldId: null,
    repair: { structure: ref.structure, id: ref.id, from: Math.max(0, condition) },
  });
}

/**
 * Zruší opravu stavby (mutuje stav – stavbu pozdější kontrola uznala za opuštěnou): co vesničané
 * spravili, zůstane ve stavu stavby.
 */
export function cancelRepair(state: VillageState, ref: StructureRef): void {
  const c = repairOf(state, ref);
  if (c) state.constructions = state.constructions.filter((x) => x !== c);
}

/** Stav stavby podle průběhu opravy – od stavu při zahájení rovnoměrně s prací do 1. */
export function repairedCondition(c: Pick<Construction, 'repair' | 'cost' | 'done'>): number {
  const from = c.repair?.from ?? 1;
  const progress = c.cost > 0 ? Math.min(1, c.done / c.cost) : 1;
  return from + (1 - from) * progress;
}

/** Kolik práce opravě dnes chybí; stavba, která už nestojí, nic. */
export function repairNeed(state: VillageState, c: Construction): number {
  if (!c.repair || !wearSlot(state, c.repair)) return 0;
  return Math.max(0, c.cost - c.done);
}

/** Je oprava hotová (všechna práce, nebo stavba už nestojí)? */
export function isRepairFinished(state: VillageState, c: Construction): boolean {
  return c.done >= c.cost || !c.repair || !wearSlot(state, c.repair);
}

/**
 * Vloží práci do opravy (mutuje stav): stav stavby roste s prací (plot se splétá zpět, díly
 * rozpadu se vracejí – ve scéně opačně než chátrání). `completes` = dostala vše, co jí chybělo.
 */
export function workRepair(
  state: VillageState,
  c: Construction,
  amount: number,
  completes: boolean,
): void {
  c.done = completes ? c.cost : Math.min(c.cost, c.done + amount);
  const slot = c.repair ? wearSlot(state, c.repair) : null;
  if (!slot) return;
  slot.set({ condition: Math.min(1, repairedCondition(c)) });
}

/**
 * Dokončená oprava (mutuje stav): stavba je celá – záznam chátrání zmizí. Vrátí událost kroniky;
 * stavba, která mezitím přestala stát, null.
 */
export function finishRepair(
  state: VillageState,
  day: number,
  c: Construction,
): ChronicleEvent | null {
  const slot = c.repair ? wearSlot(state, c.repair) : null;
  if (!c.repair || !slot) return null;
  slot.set(undefined);
  return { day, kind: 'structure-repaired', structure: c.repair.structure, id: c.repair.id };
}
