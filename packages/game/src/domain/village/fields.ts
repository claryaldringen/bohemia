import { dateOfDayIndex } from '../calendar';
import type { Surface } from '../landscape';
import { cloneState } from './clone';
import { foundingCostPerHa, withinBounds } from './productivity';
import {
  DISTANCE,
  FERTILITY,
  LEGUMES,
  FOREST_BONUS,
  OBSTACLE_COST,
  RECLAIM_COST_PER_HA,
  SEED_KG_PER_HA,
  YIELD_BASE_KG_PER_HA,
} from './rules';
import type { FieldPart, FieldSurface, TileCell, VillageState } from './types';

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel při porovnání podílů úrodnosti. */
const EPSILON = 1e-9;

/** Díl je v okně po vymýcení lesa (popel z pálení ještě působí). */
function inClearingWindow(part: FieldPart, day: number): boolean {
  return part.bonusUntilDay !== null && part.bonusUntilDay >= day;
}

/**
 * Bonus úrodnosti vymýceného lesa podle sezóny osevu od vymýcení: první +40, druhá +20, pak 0
 * (`sownYears` = kolik sezón už je díl oset). Mimo okno po vymýcení 0.
 */
export function forestBonus(part: FieldPart, day: number): number {
  if (!inClearingWindow(part, day)) return 0;
  return FOREST_BONUS.bySeason[part.sownYears] ?? 0;
}

/** První sezóna po vymýcení lesa – vypálená půda je bez plevele, díl se neplete. */
export function isWeedFree(part: FieldPart, day: number): boolean {
  return inClearingWindow(part, day) && part.sownYears === 0;
}

/** Úrodnost dílu v daný den: přirozená × podíl + bonus po vymýcení lesa, nejvýš 100. */
export function effectiveFertility(part: FieldPart, day: number): number {
  return Math.min(100, part.naturalFertility * part.fertilityShare + forestBonus(part, day));
}

/** Hrubá úroda v kg na hektar podle úrodnosti (0–100). */
export function grossYieldPerHa(fertility: number): number {
  return YIELD_BASE_KG_PER_HA * (0.4 + (0.6 * fertility) / 100);
}

/**
 * Vzdálenost dílu pro práci (m): chůze po vyšlapaných pěšinách (`walkDistanceM`, paths.md –
 * Pěšiny a práce), jinak přímá vzdálenost od obydlí (vsi bez krajiny, starší uložené vsi).
 */
export function partWalkDistance(part: Pick<FieldPart, 'distanceM' | 'walkDistanceM'>): number {
  return part.walkDistanceM ?? part.distanceM;
}

/** Násobek práce podle vzdálenosti od obydlí (+1 % za každých 10 m nad volnou vzdáleností). */
export function distanceFactor(distanceM: number): number {
  return 1 + ((Math.max(0, distanceM - DISTANCE.freeM) / 10) * DISTANCE.percentPer10M) / 100;
}

/** Celé kalendářní roky od `fallowSinceDay` do `day`; 0, pokud díl nikdy neležel v přílohu. */
export function fallowYears(part: FieldPart, day: number): number {
  if (part.fallowSinceDay === null) return 0;
  const since = dateOfDayIndex(part.fallowSinceDay);
  const now = dateOfDayIndex(day);
  const beforeAnniversary =
    now.month < since.month || (now.month === since.month && now.day < since.day);
  return Math.max(0, now.year - since.year - (beforeAnniversary ? 1 : 0));
}

/** Cena vrácení hektaru zarostlého dílu v člověkodnech podle let přílohu a pokrytí nástroji. */
export function reclaimCostPerHa(years: number, toolCoverage: number): number {
  const step = RECLAIM_COST_PER_HA.find((s) => years <= s.maxYears);
  return step ? withinBounds(step.cost, toolCoverage) : 0;
}

/**
 * Povrch čtverce pole při založení (fields.md – Založení pole): les podle krajiny; čtverec louky
 * je **křoviny**, když by jeho keře po kusech stály aspoň tolik, o kolik je sazba křovin (podle
 * pokrytí nástroji) dražší než louka (návrh Clauda). Cena tak s přibývajícími keři plynule roste
 * až po sazbu křovin, keře jsou pak v ceně. Bez řemesel stojí křoviny stejně jako louka (drn
 * motykou je stejně pracný jako mýcení keřů – rešerše) a s kovovými nástroji míň – pak je
 * křovinami čtverec s jakýmkoli keřem. Voda povrch pole není – `null`.
 */
export function fieldSquareSurface(
  surface: Surface,
  shrubs: number,
  squareAreaM2: number,
  toolCoverage: number,
): FieldSurface | null {
  if (surface === 'water') return null;
  if (surface === 'forest') return 'forest';
  const premium =
    (foundingCostPerHa('shrub', toolCoverage) - foundingCostPerHa('meadow', toolCoverage)) *
    (squareAreaM2 / M2_PER_HA);
  return shrubs > 0 && shrubs * OBSTACLE_COST.shrub >= premium - EPSILON ? 'shrub' : 'meadow';
}

/** Cena založení dílu: povrch × hektary (podle pokrytí nástroji) + překážky. */
export function partFoundingCost(
  surface: FieldSurface,
  areaM2: number,
  obstacleCost: number,
  toolCoverage: number,
): number {
  return foundingCostPerHa(surface, toolCoverage) * (areaM2 / M2_PER_HA) + obstacleCost;
}

/**
 * Konec hospodářského roku (1. 9.) pro jeden díl – mění ho na místě: osev vyčerpá úrodnost
 * (pod 70 % jde díl do přílohu; luštěniny ji naopak trochu vrátí – poutají dusík, fields.md –
 * Luštěniny), příloh ji obnoví.
 */
export function endOfSeason(part: FieldPart, day: number): void {
  if (part.state === 'sown') {
    part.fertilityShare =
      part.crop === 'legume'
        ? Math.min(1, part.fertilityShare + LEGUMES.fertilityGain)
        : part.fertilityShare - FERTILITY.sowDepletion;
    part.sownYears += 1;
    if (part.fertilityShare < FERTILITY.sowableMin - EPSILON) {
      part.state = 'fallow';
      part.fallowSinceDay = day;
      part.sownYears = 0;
      part.bonusUntilDay = null; // fáze osevu skončila – popel z vymýcení už nepůsobí
      delete part.crop;
    }
    return;
  }
  if (part.state === 'fallow') {
    // příloh je pastvina – nezarůstá v les, jen se mu vrací úrodnost
    part.fertilityShare = Math.min(1, part.fertilityShare + FERTILITY.fallowRecovery);
  }
}

/**
 * Skupina dílu v pořadí přílohové soustavy (fields.md – Přílohová soustava): 1 osévaný díl, který
 * smí dál (≥ 0,7), 2 čerstvě založený (připravený), 3 příloh zotavený aspoň na 0,95, 4 příloh
 * 0,7–0,95; jiný díl (zakládaný, vyčerpaný příloh) null.
 */
export type SowingGroup = 1 | 2 | 3 | 4;
export function sowingGroup(p: FieldPart): SowingGroup | null {
  const sowable = p.fertilityShare >= FERTILITY.sowableMin - EPSILON;
  if (p.state === 'sown') return sowable ? 1 : null;
  if (p.state === 'ready') return 2;
  if (p.state !== 'fallow' || !sowable) return null;
  return p.fertilityShare >= FERTILITY.fallowReady - EPSILON ? 3 : 4;
}

/**
 * Díly, které smí ves osít, v pořadí ze spec: osetý (≥ 0,7), připravený, příloh ≥ 0,95
 * (nejmladší první), příloh ≥ 0,7 (nejúrodnější první). Díly nemění. Ves s hospodářstvími bere
 * díly po úsecích (`sowingBlocks` v holdings.ts).
 */
export function sowingOrder(parts: FieldPart[]): FieldPart[] {
  const since = (p: FieldPart): number => p.fallowSinceDay ?? -Infinity;
  const byDistance = (a: FieldPart, b: FieldPart): number => a.distanceM - b.distanceM;
  const inGroup = (group: SowingGroup): FieldPart[] =>
    parts.filter((p) => sowingGroup(p) === group);
  const group1 = inGroup(1).sort(byDistance);
  const group2 = inGroup(2).sort(byDistance);
  const group3 = inGroup(3).sort((a, b) => since(b) - since(a) || byDistance(a, b));
  const group4 = inGroup(4).sort((a, b) => b.fertilityShare - a.fertilityShare || byDistance(a, b));
  return [...group1, ...group2, ...group3, ...group4];
}

/** Očekávaná čistá úroda dílu (kg) při plné a včasné práci – jak ji odhaduje ves při osevu. */
export function expectedNetKg(part: FieldPart, day: number): number {
  return (
    (grossYieldPerHa(effectiveFertility(part, day)) - SEED_KG_PER_HA) * (part.areaM2 / M2_PER_HA)
  );
}

/**
 * Vybere díly k osevu v pořadí `sowingOrder`. Přidává, dokud očekávaná čistá úroda nepokryje
 * cíl, a nepřekročí `maxHa`. Díly nemění.
 */
export function selectPartsToSow(
  parts: FieldPart[],
  targetKg: number,
  maxHa: number,
  day: number,
): FieldPart[] {
  const chosen: FieldPart[] = [];
  let net = 0;
  let ha = 0;
  for (const p of sowingOrder(parts)) {
    if (net >= targetKg) break;
    const partHa = p.areaM2 / M2_PER_HA;
    if (ha + partHa > maxHa + EPSILON) break;
    chosen.push(p);
    ha += partHa;
    net += expectedNetKg(p, day);
  }
  return chosen;
}

/** Políčka sdílejí stranu. */
function sharesEdge(a: TileCell, b: TileCell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/**
 * Pole, na která čtverce navazují stranou (fields.md – Navazující pole; Martin, 18. 10. 2026:
 * „Pokud více polí navazuje přímo na sebe, počítají se jako jedno.“): id polí od nejstaršího
 * (nejmenší id). Žádné = nové pole, jedno = čtverce ho rozšíří, víc = pole se sloučí do
 * nejstaršího. Díly bez políčka (staré pole z obrysu) nenavazují.
 */
export function fieldsTouching(
  parts: readonly { readonly cell?: TileCell; readonly fieldId?: number }[],
  cells: readonly TileCell[],
): number[] {
  const ids = new Set<number>();
  for (const part of parts) {
    if (part.cell === undefined || part.fieldId === undefined || ids.has(part.fieldId)) continue;
    const cell = part.cell;
    if (cells.some((c) => sharesEdge(c, cell))) ids.add(part.fieldId);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Sloučí pole `others` do pole `into` (mutuje stav – fields.md, Navazující pole; Martin): díly
 * s nezměněným stavem (úrodnost, osev, příloh, plodina) přejdou do `into`, rozestavěná založení
 * se spojí do jedné stavby (nejstarší, s cenou a prací všech) a kronika i rozdělení práce dne
 * (cíl práce a stavba) odkazují na `into` a jeho stavbu; sloučená pole zmizí. Plán osevu vede
 * díly, ne pole – nemění se. Jediné místo slučování: akce hráče (`foundField`) i převod starých
 * navazujících polí při načtení (`withMergedFields`).
 */
export function mergeFields(state: VillageState, into: number, others: readonly number[]): void {
  const merged = new Set(others);
  for (const part of state.parts) if (merged.has(part.fieldId)) part.fieldId = into;
  state.fields = state.fields.filter((f) => !merged.has(f.id));
  const founding = state.constructions
    .filter(
      (c) =>
        c.kind === 'field' && c.fieldId !== null && (c.fieldId === into || merged.has(c.fieldId)),
    )
    .sort((a, b) => a.id - b.id);
  const kept = founding[0];
  const dropped = new Set(founding.slice(1).map((c) => c.id));
  if (kept) {
    kept.fieldId = into;
    for (const c of founding.slice(1)) {
      kept.cost += c.cost;
      kept.done += c.done;
    }
    state.constructions = state.constructions.filter((c) => !dropped.has(c.id));
  }
  for (const event of state.chronicle) {
    if (
      event.kind === 'construction-finished' &&
      event.fieldId !== null &&
      merged.has(event.fieldId)
    ) {
      event.fieldId = into;
    }
  }
  for (const share of state.labor?.shares ?? []) {
    if (share.target.kind === 'field' && merged.has(share.target.id)) share.target.id = into;
    if (kept && share.construction !== undefined && dropped.has(share.construction)) {
      share.construction = kept.id;
    }
  }
}

/** Klíč políčka pro mapy. */
function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Stará navazující pole se sloučí (fields.md – Navazující pole; Martin, 18. 10. 2026): pole, která
 * vznikla samostatně dřív, než se navazující čtverce začaly slučovat, a stranou na sebe navazují,
 * se při načtení vsi spojí – každá souvislá skupina polí (sousedství stranou přes všechna pole,
 * i řetězem) do pole s nejmenším id přes `mergeFields`. Rohem se nenavazuje; díly bez políčka
 * a pole s obrysem (první prototyp) se neslučují. Ves bez takových polí vrací beze změny (týž
 * objekt – nic se neukládá).
 *
 * Příznak „převedeno“ (jako `plotsMigrated`) převod nepotřebuje: je idempotentní – po sloučení
 * žádná dvě pole stranou nenavazují a nová navazující pole nevzniknou, protože `foundField` je
 * slučuje hned – a levný (jeden průchod díly), takže smí běžet při každém načtení. Simulace pole
 * neslučuje ani políčka dílů nemění, takže po prvním převodu je každý další beze změny a dopočet
 * po kouscích dá totéž co vcelku.
 */
export function withMergedFields(state: VillageState): VillageState {
  const eligible = new Set(state.fields.filter((f) => f.outline === undefined).map((f) => f.id));
  const parent = new Map<number, number>();
  const root = (id: number): number => {
    let r = id;
    for (let up = parent.get(r); up !== undefined && up !== r; up = parent.get(r)) r = up;
    return r;
  };
  const byCell = new Map<string, number>();
  const cells: { x: number; y: number; fieldId: number }[] = [];
  for (const part of state.parts) {
    if (part.cell === undefined || !eligible.has(part.fieldId)) continue;
    byCell.set(cellKey(part.cell.x, part.cell.y), part.fieldId);
    cells.push({ x: part.cell.x, y: part.cell.y, fieldId: part.fieldId });
  }
  for (const { x, y, fieldId } of cells) {
    // stačí soused vpravo a dole – každá dvojice stranou se tak potká jednou
    for (const other of [byCell.get(cellKey(x + 1, y)), byCell.get(cellKey(x, y + 1))]) {
      if (other === undefined || other === fieldId) continue;
      const a = root(fieldId);
      const b = root(other);
      // kořen skupiny je vždy nejmenší id – do něj se slučuje
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
    }
  }
  const groups = new Map<number, number[]>();
  for (const id of [...eligible].sort((a, b) => a - b)) {
    const r = root(id);
    if (r !== id) groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  if (groups.size === 0) return state;
  const next = cloneState(state);
  for (const [into, others] of [...groups].sort(([a], [b]) => a - b)) {
    mergeFields(next, into, others);
  }
  return next;
}
