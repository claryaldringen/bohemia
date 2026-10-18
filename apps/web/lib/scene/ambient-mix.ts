import { CAMERA_ZOOM_M } from './constants';
import type { ForestField } from '@bohemia/game';
import { bedMix } from './ground-layers';
import type { StreamPoint } from './stream-geometry';
import { frozenShare } from './water-ice';

/**
 * Mix ambientních zvuků krajiny podle toho, kam se kamera dívá – čisté funkce bez enginu
 * a bez Web Audio (přehrává je `ambient-sound.ts`).
 *
 * Vzor je 0 A.D.: ptáci dne hrají po celé mapě jako ambient hry (`gui/session/Ambient.js`,
 * `day_temperate_gen_03.ogg`), voda a vítr jsou zvuky na místě, které slábnou se vzdáleností od
 * posluchače (OpenAL „inverse distance clamped“ – hlasitost ∝ 1 / vzdálenost) a hrají jen to,
 * co je v záběru (`CSoundGroup::UploadPropertiesAndPlay`).
 */

export const AMBIENT_LAYERS = [
  'birds',
  'birdsong',
  'leaves',
  'streamMedium',
  'streamFast',
] as const;

/**
 * Vrstvy: `birds` ptáci dne všude, `birdsong` zpěv ptáků u lesa (hlavně na okraji), `leaves`
 * vítr v listí v lese a u něj, `stream*` potok tam, kde teče přes oblázky, podle rychlosti proudu.
 */
export type AmbientLayer = (typeof AMBIENT_LAYERS)[number];

/** Cílová hlasitost každé vrstvy 0–1 (lineárně, už včetně vzájemného poměru vrstev). */
export type AmbientGains = Record<AmbientLayer, number>;

/** Kam se kamera dívá: cíl na zemi (m) a vzdálenost kamery od cíle (`ArcRotateCamera.radius`). */
export interface AmbientView {
  x: number;
  z: number;
  radius: number;
}

/** Co v krajině zní – podmnožina `StreamCenterline` a `ForestField`. */
export interface AmbientEnvironment {
  stream: {
    points: readonly Pick<StreamPoint, 'x' | 'z' | 'speed' | 'pool' | 'halfLeft' | 'halfRight'>[];
  };
  forest: Pick<ForestField, 'distanceAt'>;
}

/** Rozsah přiblížení kamery (camera.ts). */
const ZOOM_NEAR_M = CAMERA_ZOOM_M.min;
const ZOOM_FAR_M = CAMERA_ZOOM_M.max;
/** Posluchač je nad cílem kamery ve výšce tohoto podílu vzdálenosti kamery. */
const LISTENER_HEIGHT = 0.35;
/** Do této vzdálenosti (m) zní zdroj naplno – posluchač při největším přiblížení. */
const REFERENCE_DISTANCE_M = ZOOM_NEAR_M * LISTENER_HEIGHT;
/**
 * Záběr kolem cíle (podíl vzdálenosti kamery): do VIEW_INNER zní zdroje naplno, za VIEW_OUTER
 * už ne – jako 0 A.D., které zdroje mimo obrazovku nepouští.
 */
const VIEW_INNER = 0.5;
const VIEW_OUTER = 1;
/** Les se vzorkuje v mřížce 3 × 3 kolem cíle s roztečí tohoto podílu vzdálenosti kamery. */
const FOREST_SAMPLE_SPACING = 0.4;
/** Vítr v listí: od kolika metrů před hranicí lesa začíná a kde zní naplno (m). */
const LEAVES_FROM_M = -30;
const LEAVES_FULL_M = 30;
/** Pásmo okraje lesa pro zpěv ptáků: aspoň tolik metrů, při oddálení podíl vzdálenosti kamery. */
const EDGE_WIDTH_M = 60;
const EDGE_WIDTH_ZOOM = 0.15;
/** Zpěv ptáků uvnitř lesa vůči okraji. */
const INTERIOR_BIRDSONG = 0.5;
/** Ptáci dne při největším oddálení (podíl hlasitosti při přiblížení) – krajina neztichne. */
const BIRDS_FAR = 0.55;
/**
 * Rychlosti proudu (0–1), kde zní naplno střední (mírný proud přes oblázky) a rychlá voda
 * (prudká peřej). Oblázky na dně jsou od rychlosti ≈ 0,55, typicky 0,64–0,88.
 */
const MEDIUM_SPEED = 0.6;
const FAST_SPEED = 0.9;

/**
 * Hlasitost vrstev naplno (lineárně). Soubory mají sjednocenou hlasitost (kromě vody, kde zůstal
 * poměr 0 A.D.: střední voda tišší než rychlá) – tady se ladí vzájemný poměr.
 */
const LEVEL: AmbientGains = {
  birds: 0.5,
  birdsong: 0.6,
  leaves: 0.7,
  streamMedium: 0.9,
  streamFast: 0.9,
};

/**
 * Roční období (season-look.ts): násobky hlasitosti – v zimě ptáci skoro mlčí a vítr šumí
 * v holých větvích tišeji, na jaře zpívají víc, na podzim víc fouká. 1 = léto. `ice` = led na
 * vodě 0–1 (water-ice.ts) – potok pod ledem je tišší; bez údaje žádný.
 */
export interface AmbientSeason {
  birds: number;
  birdsong: number;
  leaves: number;
  ice?: number;
}

/** O kolik ztichne zamrzlá část potoka (podíl hlasitosti) – pod ledem voda jen tlumeně bublá. */
const ICE_MUFFLE = 0.85;

const SUMMER_SOUND: AmbientSeason = { birds: 1, birdsong: 1, leaves: 1 };

/** Cílové hlasitosti vrstev pro pohled kamery (a roční období). */
export function ambientMix(
  view: AmbientView,
  environment: AmbientEnvironment,
  season: AmbientSeason = SUMMER_SOUND,
): AmbientGains {
  const radius = Number.isFinite(view.radius)
    ? Math.min(ZOOM_FAR_M, Math.max(ZOOM_NEAR_M, view.radius))
    : ZOOM_FAR_M;
  const zoom = Math.log(radius / ZOOM_NEAR_M) / Math.log(ZOOM_FAR_M / ZOOM_NEAR_M);
  const listenerHeight = radius * LISTENER_HEIGHT;
  const stream = streamPresence(view, radius, environment.stream.points, season.ice ?? 0);
  const forest = forestPresence(view, radius, environment.forest);
  // Plošné zdroje (les) slábnou s oddálením pomaleji než bodové (odmocnina z útlumu).
  const area = Math.sqrt(attenuation(listenerHeight));
  return {
    birds: Math.min(1, LEVEL.birds * (1 + (BIRDS_FAR - 1) * zoom) * season.birds),
    birdsong: Math.min(1, LEVEL.birdsong * area * forest.birdsong * season.birdsong),
    leaves: Math.min(1, LEVEL.leaves * area * forest.leaves * season.leaves),
    streamMedium: LEVEL.streamMedium * stream.medium,
    streamFast: LEVEL.streamFast * stream.fast,
  };
}

/**
 * Podíl střední a rychlé vody pro rychlost proudu 0–1. Prolínání drží stejný výkon (součet
 * čtverců 1) – šum vody se při změně rychlosti mění v barvě, ne v hlasitosti.
 */
export function streamSpeedWeights(speed: number): { medium: number; fast: number } {
  if (!(speed > MEDIUM_SPEED)) return { medium: 1, fast: 0 };
  if (speed >= FAST_SPEED) return { medium: 0, fast: 1 };
  const t = (speed - MEDIUM_SPEED) / (FAST_SPEED - MEDIUM_SPEED);
  return { medium: Math.cos((t * Math.PI) / 2), fast: Math.sin((t * Math.PI) / 2) };
}

/** Útlum se vzdáleností od posluchače jako v 0 A.D. (OpenAL, hlasitost ∝ 1 / vzdálenost). */
function attenuation(distance: number): number {
  return Math.min(1, REFERENCE_DISTANCE_M / distance);
}

/** 1 v záběru kolem cíle, 0 mimo něj (vodorovná vzdálenost od cíle v m). */
function inView(horizontal: number, radius: number): number {
  return 1 - smoothstep(VIEW_INNER * radius, VIEW_OUTER * radius, horizontal);
}

/**
 * Potok zní jen tam, kde teče přes oblázky – štěrkové dno stejně jako na obrazovce
 * (`bedMix`); nad bahnem, pískem a v tůních je tichý (Martin). Každý úsek osy je zdroj, který
 * zní podle vzdálenosti od okraje vody a podílu oblázků na dně. Za každou rychlost proudu
 * rozhoduje nejhlasitější úsek – peřej opodál je slyšet i nad tichou tůní. V zimě ztichne
 * zamrzlá část šířky úseku (`ice`, `frozenShare`).
 */
function streamPresence(
  view: AmbientView,
  radius: number,
  points: AmbientEnvironment['stream']['points'],
  ice: number,
): { medium: number; fast: number } {
  const result = { medium: 0, fast: 0 };
  const listenerHeight = radius * LISTENER_HEIGHT;
  const reach = VIEW_OUTER * radius;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lengthSq = abx * abx + abz * abz;
    const t =
      lengthSq > 0
        ? Math.min(1, Math.max(0, ((view.x - a.x) * abx + (view.z - a.z) * abz) / lengthSq))
        : 0;
    const halfWidth =
      (a.halfLeft + a.halfRight + (b.halfLeft + b.halfRight - a.halfLeft - a.halfRight) * t) / 2;
    const toBank = Math.max(
      0,
      Math.hypot(view.x - (a.x + abx * t), view.z - (a.z + abz * t)) - halfWidth,
    );
    if (toBank >= reach) continue;
    const speed = a.speed + (b.speed - a.speed) * t;
    const pebbles = bedMix(speed, a.pool + (b.pool - a.pool) * t).gravel;
    if (pebbles <= 0) continue;
    const open = 1 - ICE_MUFFLE * frozenShare(speed, halfWidth, ice);
    const presence =
      pebbles * open * inView(toBank, radius) * attenuation(Math.hypot(toBank, listenerHeight));
    const w = streamSpeedWeights(speed);
    result.medium = Math.max(result.medium, presence * w.medium);
    result.fast = Math.max(result.fast, presence * w.fast);
  }
  return result;
}

/**
 * Les v záběru: vítr v listí podle toho, jak velkou část záběru (vážené ke středu) les
 * pokrývá; zpěv ptáků podle nejbližšího okraje lesa v záběru, uvnitř lesa slabší.
 */
function forestPresence(
  view: AmbientView,
  radius: number,
  forest: AmbientEnvironment['forest'],
): { leaves: number; birdsong: number } {
  const spacing = FOREST_SAMPLE_SPACING * radius;
  const edgeWidth = Math.max(EDGE_WIDTH_M, EDGE_WIDTH_ZOOM * radius);
  let cover = 0;
  let weights = 0;
  let edge = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      // Váha klesá od středu záběru: střed 1, strany 1/2, rohy 1/3.
      const weight = 1 / (1 + i * i + j * j);
      const distance = forest.distanceAt(view.x + i * spacing, view.z + j * spacing);
      cover += weight * smoothstep(LEAVES_FROM_M, LEAVES_FULL_M, distance);
      weights += weight;
      edge = Math.max(edge, weight * Math.exp(-((distance / edgeWidth) ** 2)));
    }
  }
  cover /= weights;
  return { leaves: cover, birdsong: Math.min(1, Math.max(edge, INTERIOR_BIRDSONG * cover)) };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
