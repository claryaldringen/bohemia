import { type ObstacleLayer } from '../../landscape';
import { buildingLocalToWorld, obstacleChangesAt } from '../core/obstacles';
import { availableTrees, claimedObstacles, isBeech, nearestMatureTrees } from '../forest/wood';
import type { Point } from '../placement/polygon';
import { BURNER_CAMP, CHARCOAL_KILN, OBSTACLE_COST } from '../rules';
import type { CampRemnant, CharcoalKiln, Dwelling, VillageState } from '../types';

// Zemnice uhlíře u milíře (workshops.md – Uhlíř – zemnice u milíře; Martin 14. 11. 2026: „…protože
// musí hlídat milíř, [postaví] si jednoduchou zemnici přímo v lese u milíře. V té zemnici bude
// přespávat, dokud bude vypalovat milíř. Tuto zemnici bude opakovaně využívat, dokud v jejím okolí
// bude dost stromů, ze kterých bude moci stavět milíře.“; podrobnosti návrh Clauda): uhlíř ji
// postaví u milíře, kde začíná novou dávku buků – 3 stromy z kácení pro milíř a 10 čd z práce
// milíře. Dokud je do 150 m od ní dávka buků, vybírá se další dávka od zemnice; jinak zemnici
// opustí a postaví novou u nového milíře. Opuštěná zemnice za 5 let zmizí. Místo se hledá
// deterministicky (`findCampSite` v kiln-site.ts – body kružnic přes det-math).

const DAYS_PER_YEAR = 365;

/** Poloha zemnice – střed (m) a natočení (vchod, osa +z modelu, míří k milíři). */
export interface CampSite {
  x: number;
  z: number;
  rotation: number;
}

/**
 * Kde postavit zemnici u milíře se středem `kilnSite` (`findCampSite` v kiln-site.ts); null = místo
 * bez stromů do BURNER_CAMP.maxFromKilnM není.
 */
export type CampSiteFinder = (kilnSite: { x: number; z: number }) => CampSite | null;

/**
 * Rohy půdorysu zemnice (BURNER_CAMP.footprintM – šířka napříč, hloubka k vchodu) ve světě,
 * s pruhem `margin` (m) na všechny strany; deterministicky (kontrola v prohlížeči i na serveru).
 */
export function campFootprint(camp: CampSite, margin = 0): Point[] {
  const halfWidth = BURNER_CAMP.footprintM.width / 2 + margin;
  const halfDepth = BURNER_CAMP.footprintM.depth / 2 + margin;
  const position = { x: camp.x, z: camp.z, rotation: camp.rotation };
  return [
    buildingLocalToWorld(position, -halfWidth, -halfDepth),
    buildingLocalToWorld(position, halfWidth, -halfDepth),
    buildingLocalToWorld(position, halfWidth, halfDepth),
    buildingLocalToWorld(position, -halfWidth, halfDepth),
  ];
}

/**
 * Natočení zemnice v bodě kružnice kolem milíře pod úhlem `angle` (bod = milíř + r · (cos, sin)) –
 * vchod (osa +z modelu míří do (sin r, cos r)) k milíři, tedy do (−cos, −sin): 3π/2 − úhel, 0 až 2π.
 * Bez atan2 – úhel bodu je známý.
 */
export function campRotation(angle: number): number {
  const rotation = 1.5 * Math.PI - angle;
  return rotation < 0 ? rotation + 2 * Math.PI : rotation;
}

/**
 * Zemnice uhlířů vsi – hotové, rozestavěné (`Workshop.camp`) i opuštěné (`campRemnants`): brání
 * stavbám a milíři (`PlacementVillage.camps`) a pěšina je obchází (`PathVillage.camps`).
 */
export function burnerCampSites(
  state: Pick<VillageState, 'dwellings' | 'campRemnants'>,
): CampSite[] {
  const out: CampSite[] = [];
  for (const d of state.dwellings) {
    const camp = d.workshop?.camp;
    if (camp) out.push({ x: camp.x, z: camp.z, rotation: camp.rotation });
  }
  for (const r of state.campRemnants ?? []) out.push({ x: r.x, z: r.z, rotation: r.rotation });
  return out;
}

/**
 * Využije uhlíř zemnici `camp` pro další milíř? Ano, když 15 nejbližších volných buků
 * (CHARCOAL_KILN.trees – jako dávka milíře, `nearestMatureTrees` bez vyhrazených a posvátných)
 * leží do BURNER_CAMP.reuseRadiusM od ní; dávka se pak vybírá od zemnice.
 */
export function campUsable(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer,
  camp: { x: number; z: number },
): boolean {
  // málo buků v celé krajině – po políčkách se nehledá (celá vrstva by se procházela)
  if (availableTrees(obstacles, state, day, 'beeches') < CHARCOAL_KILN.trees) return false;
  const beeches = nearestMatureTrees(
    obstacles,
    obstacleChangesAt(state, day),
    camp,
    CHARCOAL_KILN.trees,
    claimedObstacles(state),
    isBeech,
  );
  return (
    beeches.length >= CHARCOAL_KILN.trees &&
    beeches.every((t) => t.distanceM <= BURNER_CAMP.reuseRadiusM)
  );
}

/**
 * Nová zemnice u milíře `kiln`, který uhlíř dnes začal (mutuje stav): stará zemnice se opustí
 * (`abandonCamp`), místo nové najde `find` u milíře. Stromy na ni jdou z vyklízení milířiště
 * (`campTrees`), id z `nextId`. Milíř bez polohy (ves bez vrstvy překážek) ani bez místa zemnici
 * nemá – uhlíř hlídá u milíře jako dřív a zkusí to u dalšího milíře.
 */
export function moveCamp(
  state: VillageState,
  burner: Dwelling,
  kiln: CharcoalKiln,
  day: number,
  obstacles: ObstacleLayer | null,
  find: CampSiteFinder | undefined,
): void {
  abandonCamp(state, burner, day);
  if (!kiln.site || !obstacles || !find) return;
  const site = find(kiln.site);
  if (!site) return;
  campTrees(state, kiln, site, obstacles, day);
  burner.workshop!.camp = {
    id: state.nextId++,
    x: site.x,
    z: site.z,
    rotation: site.rotation,
    done: 0,
  };
}

/**
 * Stromy na zemnici (mutuje milíř): BURNER_CAMP.trees klád z vyklízení milířiště
 * (`clearing.logs` se o ně zmenší – na hromadu vsi nejdou); chybějící skácí uhlíř navíc – nejbližší
 * dospělé stromy k zemnici, které nejsou v dávce, na milířišti, vyhrazené ani posvátné. Přidají se
 * k vyklízení milířiště za OBSTACLE_COST.tree a klády nedají.
 */
function campTrees(
  state: VillageState,
  kiln: CharcoalKiln,
  camp: CampSite,
  obstacles: ObstacleLayer,
  day: number,
): void {
  const logs = kiln.clearing?.logs ?? 0;
  const fromClearing = Math.min(BURNER_CAMP.trees, logs);
  if (kiln.clearing) kiln.clearing.logs = logs - fromClearing;
  const missing = BURNER_CAMP.trees - fromClearing;
  if (missing <= 0) return;
  // buky dávky patří milíři a milířiště se kácí tak jako tak
  const exclude = claimedObstacles(state);
  for (const t of kiln.trees) if (t.id !== null) exclude.add(t.id);
  for (const id of kiln.clearing?.ids ?? []) exclude.add(id);
  const extra = nearestMatureTrees(
    obstacles,
    obstacleChangesAt(state, day),
    camp,
    missing,
    exclude,
  );
  if (extra.length === 0) return;
  const clearing = (kiln.clearing ??= { ids: [], cost: 0, logs: 0 });
  clearing.ids.push(...extra.map((t) => t.id));
  clearing.cost += extra.length * OBSTACLE_COST.tree;
}

/**
 * Uhlíř zemnici opustí (mutuje stav) – nahradí ji novou, nebo jeho dílna zanikla: zemnice přejde
 * do `campRemnants` s dnešním dnem, chátrá a za BURNER_CAMP.abandonedYears zmizí. Bez zemnice nic.
 */
export function abandonCamp(state: VillageState, burner: Dwelling, day: number): void {
  const camp = burner.workshop?.camp;
  if (!camp) return;
  (state.campRemnants ??= []).push({
    id: camp.id,
    burnerId: burner.id,
    x: camp.x,
    z: camp.z,
    rotation: camp.rotation,
    day,
  });
  delete burner.workshop!.camp;
}

/** Jak opuštěná zemnice zchátrala 0–1 (0 = dnes opuštěná, 1 = zmizí). */
export function campRemnantOvergrowth(r: Pick<CampRemnant, 'day'>, day: number): number {
  return Math.min(1, Math.max(0, (day - r.day) / (BURNER_CAMP.abandonedYears * DAYS_PER_YEAR)));
}

/** Zchátralé opuštěné zemnice zmizí (mutuje stav; bez nich nic, prázdný seznam ze stavu zmizí). */
export function updateCampRemnants(state: VillageState, day: number): void {
  const remnants = state.campRemnants;
  if (!remnants) return;
  const kept = remnants.filter((r) => campRemnantOvergrowth(r, day) < 1);
  if (kept.length === remnants.length) return;
  if (kept.length > 0) state.campRemnants = kept;
  else delete state.campRemnants;
}
