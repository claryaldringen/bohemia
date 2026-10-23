import type { FieldPartLook } from '../field-progress';
import { FIELD_WALK, PATH_WALK, ROAD_TREE_SPEED, ROAD_WALK } from '../rules';
import type { PartStage } from '../summary';
import type { RoadGrade, RoadLining } from '../types';

// Rychlost chůze proti louce (roads.md – Rychlejší chůze, paths.md – ceny buněk, fields.md –
// Vzdálenost; Martin, 19. 10. 2026: „berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá
// vyšlapaná cesta 1.5. Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7 – tyhle hodnoty
// se týkají chůze.“). Jedno místo pro síť pěšin (cena buňky = 1 / rychlost) i vzdálenost chůze
// (`walking.ts`) – obě jdou stejně rychle. Čisté funkce, deterministické (jen dělení).

/** Díl pole, jak ho zná chůze – stadium a vzhled (u rozpracovaného dílu i část před prací). */
export interface WalkPart {
  /** Id dílu pole (`FieldPart.id`) – vůz podle něj zapisuje pošlapanou úrodu; testy bez něj. */
  partId?: number;
  stage: PartStage;
  /** Co je na dílu vidět (`fieldPartLooks`); bez údaje podle stadia. */
  look?: FieldPartLook;
  /** Rozpracovaný díl: hotová část 0–1 má `look`, zbytek `before`. */
  work?: number;
  before?: FieldPartLook;
}

/** Vzhledy dílu v osevu – od orby nebo kopání po sklizeň (zoraný, osetý, rostoucí, zralý, žeň). */
const CROP_LOOKS: ReadonlySet<FieldPartLook> = new Set<FieldPartLook>([
  'plowed',
  'sown',
  'sprouted',
  'green',
  'ripe',
  'harvesting',
]);

/** Vzhled dílu pro chůzi – u rozpracovaného dílu ta část, které je víc; bez vzhledu null. */
function walkLook(part: WalkPart): FieldPartLook | null {
  if (!part.look) return null;
  if (part.work !== undefined && part.work < 0.5 && part.before) return part.before;
  return part.look;
}

/**
 * Rychlost chůze přes díl pole proti louce (FIELD_WALK): v osevu 0,5, strniště 0,8; úhor, příloh
 * (i zarůstající – křoviny a mladý les zdržují jako vegetace, ne jako pole) a zakládaný díl jako
 * louka. Bez vzhledu podle stadia – díl v plánu osevu (`sown`) jako v osevu.
 */
export function partWalkSpeed(part: WalkPart): number {
  const look = walkLook(part);
  if (look === null) return part.stage === 'sown' ? FIELD_WALK.crop : 1;
  if (CROP_LOOKS.has(look)) return FIELD_WALK.crop;
  if (look === 'stubble') return FIELD_WALK.stubble;
  return 1;
}

/** Díl v osevu – pěšina dne přes něj nezrychlí, platí cena pole. */
export function isCropPart(part: WalkPart): boolean {
  const look = walkLook(part);
  return look === null ? part.stage === 'sown' : CROP_LOOKS.has(look);
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
export function roadWalkSpeed(grade: RoadGrade, wet: boolean, treeSpeed = 0): number {
  if (!wet) return ROAD_WALK.speed[grade] + treeSpeed;
  return grade === 'causeway' || grade === 'wagon'
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
