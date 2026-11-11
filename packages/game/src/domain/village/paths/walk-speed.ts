import type { FieldPartLook } from '../fields/field-progress';
import { FIELD_WALK, PATH_WALK, ROAD_TREE_SPEED, ROAD_WALK } from '../rules';
import type { PartStage } from '../core/summary';
import type { RoadGrade, RoadLining } from '../types';

// Rychlost chůze proti louce (roads.md – Rychlejší chůze, paths.md – ceny buněk, fields.md –
// Vzdálenost; Martin, 19. 10. 2026: „berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá
// vyšlapaná cesta 1.5. Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7 – tyhle hodnoty
// se týkají chůze.“). Jedno místo pro síť pěšin (cena buňky = 1 / rychlost) i vzdálenost chůze
// (`walking.ts`) – obě jdou stejně rychle. Čisté funkce, deterministické (jen dělení).

/**
 * Díl pole, jak ho zná chůze. Cenu určuje jen to, jestli díl zarostl (stadium); vzhled dílu
 * (`look`, `work`, `before`) mapu tras nemění (paths.md – Stálé trasy) – údaje zůstávají kvůli
 * volajícím, kteří je dál předávají.
 */
export interface WalkPart {
  stage: PartStage;
  /** Co je na dílu vidět (`fieldPartLooks`) – na cenu nemá vliv. */
  look?: FieldPartLook;
  work?: number;
  before?: FieldPartLook;
}

/** Zarostlý díl (křoviny, mladý les) – zdržuje jako vegetace (`OVERGROWN_COST`), ne jako pole. */
function overgrown(stage: PartStage): boolean {
  return stage === 'shrubs' || stage === 'young-forest';
}

/**
 * Rychlost chůze přes díl pole proti louce (paths.md – Stálé trasy, pravidlo 1): stálá
 * `FIELD_WALK.field` v každém stadiu (zakládaný, v osevu, strniště, úhor, louka přílohu);
 * zarostlý díl (křoviny, mladý les) jako louka – zdrží vegetace.
 */
export function partWalkSpeed(part: WalkPart): number {
  return overgrown(part.stage) ? 1 : FIELD_WALK.field;
}

/** Díl, který je polem (ne zarostlý) – pěšina dne přes něj nezrychlí, platí stálá cena pole. */
export function isCropPart(part: WalkPart): boolean {
  return !overgrown(part.stage);
}

/** Kolik z ceny louky stojí metr pěšiny dne síly `strength` 0–1 (plná pěšina 1 / PATH_WALK.speed). */
export function pathCostFactor(strength: number): number {
  return 1 - (1 - 1 / PATH_WALK.speed) * Math.min(1, Math.max(0, strength));
}

/**
 * Rychlost chůze po pevné cestě proti louce – podle stupně a mokřiny (ROAD_WALK); mimo mokřinu
 * i se stromy u cesty (`treeSpeed` – `roadTreeSpeed`, roads.md – Stromy u cesty zrychlí chůzi).
 * Hať a vozová cesta (zpevněné koleje – roads.md, Vozová cesta) drží rychlost i v mokřině.
 */
export function roadWalkSpeed(
  grade: RoadGrade,
  wet: boolean,
  treeSpeed = 0,
  unbridged = false,
): number {
  if (!wet) return ROAD_WALK.speed[grade] + treeSpeed;
  // upravená cesta má hať, pokud není `unbridged` (roads.md – Vylepšení cesty)
  return grade === 'wagon' || (grade === 'improved' && !unbridged)
    ? ROAD_WALK.causewayWetSpeed
    : ROAD_WALK.wetSpeed;
}

/**
 * O kolik stromy u cesty zrychlí chůzi i jízdu vozem po úseku (roads.md – Stromy u cesty zrychlí
 * chůzi; Martin 20. 10. 2026): přičte se k rychlosti cesty mimo mokřinu a brod – stromy
 * ROAD_TREE_SPEED.trees, jabloně ROAD_TREE_SPEED.apples, úměrně olemované délce (`Road.lined`).
 * Bez olemování 0.
 */
export function roadTreeSpeed(lined: RoadLining | undefined): number {
  if (!lined || (lined.trees === 0 && lined.apples === 0)) return 0;
  return ROAD_TREE_SPEED.trees * lined.trees + ROAD_TREE_SPEED.apples * lined.apples;
}
