// Rozpad opuštěných staveb bez Babylonu (docs/design/abandonment.md – Martin 18. 10. 2026: „Jo ty
// stavby, kam nikdo nechodí, budou postupně chátrat a rozpadnou se“): stupeň podle stavu stavby
// (stejné hranice jako obydlí – dwelling-decay.ts), které díly modelů který stupeň modly, svatyně
// a ohrady ukáže (hotové modely, díly staveniště a díly rozpadu z models/sacred/sacred-decay.glb
// a models/pen/pen-decay.glb – tools/blender/sacred.py a pen.py), jak se modla kloní, jak zbytek
// padlé modly a příkop svatyně zarůstají a jak se rozpadá pletený plot hřbitova a ohrady.
import type { SacredBuildingKind } from '@bohemia/game';
import { decayStage, type DecayStage } from './dwelling-decay';
import { PEN_MODEL_PARTS } from './pen-layout';
import { seededRandom } from './village-layout';

/** Stupeň rozpadu stavby: 0 celá, 1 sešlá, 2 nakloněná (propadá se), 3 rozpadlá. */
export type StructureStage = DecayStage;

/** Názvy stupňů rozpadu staveb (náhled staveb). */
export const STRUCTURE_STAGE_LABELS: Record<DecayStage, string> = {
  0: 'celá',
  1: 'sešlá – zšedlé dřevo, mech, obětiny pryč',
  2: 'nakloněná – shnilá pata, stavba se kloní',
  3: 'rozpadlá – silně nakloněná, zarůstá',
};

/** Díl modelu posvátné stavby – klíč předlohy, a jestli se kloní s modlou. */
export interface SacredDecayPart {
  key: string;
  /** Kloní se s modlou (náklon `sacredLean`). */
  lean?: true;
}

/** Hotová svatyně z dílů staveniště (bez ohnišť – ta kreslí `shrine-fires-cold`). */
const SHRINE_GROUND = [
  'svatyne-platform-2',
  ...Array.from({ length: 8 }, (_, k) => `svatyne-ditch-${k + 1}`),
];

/**
 * Díly modly nebo svatyně podle stupně rozpadu (abandonment.md – Co hráč vidí). Celá
 * navštěvovaná stavba je hotový model (`idol`, `shrine`); opuštěné svatyni vyhasnou ohniště hned,
 * i když je ještě celá. Sešlá: zšedlá modla s mechem, obětiny a stužka pryč; nakloněná
 * a rozpadlá: kloní se, klínové kameny rozvalené, udusaný kruh a dlažba zarůstají.
 */
export function sacredDecayParts(
  kind: SacredBuildingKind,
  stage: DecayStage,
  abandoned: boolean,
): SacredDecayPart[] {
  if (kind === 'idol') {
    if (stage === 0) return [{ key: 'idol' }];
    const weathered: SacredDecayPart[] = [
      { key: 'idol-weathered', lean: true },
      { key: 'idol-weathered-moss', lean: true },
    ];
    if (stage === 1) return [{ key: 'modla-ground' }, { key: 'modla-stones' }, ...weathered];
    return [{ key: 'idol-ground-overgrown' }, { key: 'idol-stones-scattered' }, ...weathered];
  }
  if (stage === 0) {
    if (!abandoned) return [{ key: 'shrine' }];
    // opuštěná, ale celá: studená ohniště, modla s obětinami
    return [
      ...SHRINE_GROUND.map((key) => ({ key })),
      { key: 'svatyne-paving' },
      { key: 'svatyne-stones' },
      { key: 'svatyne-idol' },
      { key: 'svatyne-ribbon' },
      { key: 'svatyne-offerings' },
      { key: 'shrine-fires-cold' },
    ];
  }
  const weathered: SacredDecayPart[] = [
    { key: 'shrine-idol-weathered', lean: true },
    { key: 'shrine-idol-weathered-moss', lean: true },
  ];
  if (stage === 1) {
    return [
      ...SHRINE_GROUND.map((key) => ({ key })),
      { key: 'svatyne-paving' },
      { key: 'svatyne-stones' },
      { key: 'shrine-fires-cold' },
      ...weathered,
    ];
  }
  return [
    { key: 'shrine-ground-overgrown' },
    { key: 'shrine-paving-overgrown' },
    { key: 'shrine-fires-cold' },
    ...weathered,
  ];
}

/** Náklon modly podle stupně (rad): sešlá stojí, nakloněná ≈ 12°, rozpadlá ≈ 28°. */
const LEAN_RAD: Record<DecayStage, number> = { 0: 0, 1: 0, 2: 0.21, 3: 0.49 };

/**
 * Náklon modly (i modly uprostřed svatyně) – úhel od svislice a směr (rad, v rovině modelu: 0 =
 * dopředu +z). Směr je pevně podle id stavby – stejná modla se kloní pořád stejně.
 */
export function sacredLean(id: number, stage: DecayStage): { angle: number; heading: number } {
  const random = seededRandom(7_300_000 + id * 104_729);
  const heading = random() * Math.PI * 2;
  const jitter = 0.85 + 0.3 * random();
  return { angle: LEAN_RAD[stage] * jitter, heading };
}

/**
 * Bod modelu (x, y, z – y nahoru) nakloněný o `angle` ve směru `heading` kolem paty v počátku:
 * otočení kolem vodorovné osy kolmé na směr náklonu.
 */
export function leanPoint(
  x: number,
  y: number,
  z: number,
  lean: { angle: number; heading: number },
): [number, number, number] {
  if (lean.angle === 0) return [x, y, z];
  const dx = Math.sin(lean.heading);
  const dz = Math.cos(lean.heading);
  // složka ve směru náklonu (d) a kolmá (n) – kloní se jen d s výškou y
  const d = x * dx + z * dz;
  const nx = x - d * dx;
  const nz = z - d * dz;
  const c = Math.cos(lean.angle);
  const s = Math.sin(lean.angle);
  const d2 = d * c + y * s;
  const y2 = y * c - d * s;
  return [nx + d2 * dx, y2, nz + d2 * dz];
}

/** Díl zbytku – klíč předlohy, zapuštění pod terén (m) a zploštění výšky (násobek y). */
export interface SacredRuinPart {
  key: string;
  sinkM: number;
  heightScale: number;
}

/**
 * Zbytek padlé modly nebo svatyně podle toho, jak zarostl (0–1, abandonment.md – Následky):
 * modla leží na zemi u pahýlu a zapadá do trávy; ze svatyně zbude zarůstající příkop s valem,
 * který se postupně srovná, padlá modla v něm leží první polovinu doby.
 */
export function sacredRuinParts(kind: SacredBuildingKind, overgrowth: number): SacredRuinPart[] {
  const t = Math.min(1, Math.max(0, overgrowth));
  if (kind === 'idol') {
    return [
      { key: 'idol-ground-overgrown', sinkM: 0.12 * t, heightScale: 1 },
      { key: 'idol-stones-scattered', sinkM: 0.1 * t, heightScale: 1 },
      { key: 'idol-stump', sinkM: 0.2 * t, heightScale: 1 - 0.5 * t },
      { key: 'idol-fallen', sinkM: 0.3 * t, heightScale: 1 },
      { key: 'idol-fallen-moss', sinkM: 0.3 * t, heightScale: 1 },
    ];
  }
  const parts: SacredRuinPart[] = [
    { key: 'shrine-ground-overgrown', sinkM: 0, heightScale: 1 - 0.75 * t },
    { key: 'shrine-paving-overgrown', sinkM: 0.1 + 0.3 * t, heightScale: 1 - 0.75 * t },
  ];
  if (t < 0.5) {
    parts.push(
      { key: 'shrine-idol-stump', sinkM: 0.25 * t, heightScale: 1 },
      { key: 'shrine-idol-fallen', sinkM: 0.5 * t, heightScale: 1 },
      { key: 'shrine-idol-fallen-moss', sinkM: 0.5 * t, heightScale: 1 },
    );
  }
  return parts;
}

/**
 * Rozpad pleteného plotu hřbitova a ohrady 0–1 (`decayFence` ve woven-fence.ts) podle stavu
 * plotu: celý do 85 %, pak větve vypadávají, kůly se kloní a pod 10 % zbudou pahýly. Mohylky
 * opuštěného hřbitova zarůstají a srovnávají se spolu s plotem (cemetery-renderer.ts).
 */
export function fenceDecayAmount(condition: number | undefined): number {
  const c = condition ?? 1;
  return Math.min(1, Math.max(0, (0.85 - c) / 0.75));
}

/** Díl ohrady – z hotového modelu (pen.glb) nebo z dílů rozpadu (pen-decay.glb). */
export interface PenDecayPart {
  from: 'pen' | 'decay';
  part: string;
}

/**
 * Díly ohrady podle stupně rozpadu (abandonment.md – ohrada bez zvířat): celá z pen.glb; sešlá –
 * vybledlé a prořídlé došky s mechem, prázdné jesle, žlab bez vody; propadlá – prověšená
 * děravá střecha, branka spadlá; rozpadlá – zbyly sloupy a pár krokví, jesle se rozpadly.
 */
export function penDecayParts(stage: DecayStage): PenDecayPart[] {
  const pen = (part: string): PenDecayPart => ({ from: 'pen', part });
  const decay = (part: string): PenDecayPart => ({ from: 'decay', part });
  if (stage === 0) return PEN_MODEL_PARTS.map(pen);
  if (stage === 1) {
    return [
      ...['shelter-1', 'shelter-1-thatch', 'shelter-1-moss', 'rack-empty', 'trough-dry'].map(decay),
      pen('gate'),
    ];
  }
  if (stage === 2) {
    return [
      'shelter-2',
      'shelter-2-thatch',
      'shelter-2-moss',
      'rack-empty',
      'trough-dry',
      'gate-fallen',
    ].map(decay);
  }
  return ['shelter-3', 'shelter-3-moss', 'rack-fallen', 'trough-dry', 'gate-fallen'].map(decay);
}

/** Kde díl rozpadu ohrady stojí – jako díl hotové ohrady (`penPartPlace` v pen-layout.ts). */
export function penDecayPlace(part: string): string {
  if (part.startsWith('rack')) return 'hay-rack';
  if (part.startsWith('trough')) return 'trough';
  if (part.startsWith('gate')) return 'gate';
  return part.startsWith('shelter') ? 'shelter' : part;
}

/** Krytí bláta ohrady podle stupně – opuštěná ohrada zarůstá trávou. */
export const PEN_MUD_BY_STAGE: Record<DecayStage, number> = { 0: 1, 1: 0.5, 2: 0.2, 3: 0 };

/** Stupeň rozpadu stavby ze stavu (bez údaje celá) – jen přejmenování pro čitelnost volajících. */
export function structureDecayStage(condition: number | undefined): DecayStage {
  return decayStage(condition);
}
