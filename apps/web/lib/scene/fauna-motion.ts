import {
  BIRD_RADIUS_WOBBLE,
  fishLoopPoint,
  flockReach,
  type BirdFlock,
  type FishSchool,
} from './fauna-placement';

// Pohyb ryb a ptáků jako čistá funkce času – scéna jen dosadí čas a přepíše instance. Póza se
// zapisuje do předaného objektu (bez alokací v každém snímku).

/** Okamžitý stav zvířete pro vykreslení. */
export interface FaunaPose {
  x: number;
  y: number;
  z: number;
  /** Kam zvíře míří (jednotkový vektor; svislá složka jen při skoku ryby). */
  forwardX: number;
  forwardY: number;
  forwardZ: number;
  /** Náklon do zatáčky: vodorovná složka směru „nahoru“ (hřbet ptáka míří ke středu kruhu). */
  tiltX: number;
  tiltZ: number;
  /** Póza −1 … 1: křídla dole / nahoře, ocas na jednu / druhou stranu; 0 = základní póza. */
  flap: number;
  /** Krytí 0–1 – ryba hlouběji pod hladinou bledne do barvy vody. */
  opacity: number;
}

/** Obal, ve kterém se skupina zvířat pohybuje (podle něj se pozná, jestli je v záběru). */
export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const G = 9.81;
/** Ptáci: rychlost kolísání poloměru (rad/s) a výšky (m, rad/s). */
const WOBBLE_RATE = 0.35;
const BOB_M = 1.5;
const BOB_RATE = 0.25;
/** Unášení středu kroužení (káně): periody v obou osách (s). */
const DRIFT_PERIOD_S = [170, 230] as const;
/**
 * Mávání a plachtění jako v 0 A.D.: vrána střídá animace crow_flight (mává ≈ 2× za sekundu)
 * a crow_glide (plachtí, křídla mírně klesají), plachtění je dvakrát častější; jestřáb mává
 * zřídka. Úsek (s) a pravděpodobnost mávání v něm, kmitočet (Hz), přechod (s).
 */
const FLAP = {
  crow: { slotS: 2.2, chance: 0.38, hz: 2.4, rampS: 0.35, glide: -0.3, glidePeriodS: 3.3 },
  hawk: { slotS: 4, chance: 0.15, hz: 1.5, rampS: 0.5, glide: 0.1, glidePeriodS: 4 },
} as const;

/** Ryby: kolísání rychlosti (podíl) a jeho perioda (s) – hejno chvíli zrychlí, chvíli zvolní. */
const FISH_SURGE = 0.35;
const FISH_SURGE_PERIOD_S = 7;
/** Délka „kroku“ ocasem (m při měřítku 1): ryba se jedním mrsknutím posune o tolik. */
const FISH_STRIDE_M = 0.3;
/**
 * Model ryby leží nad hladinou (kreslí se po ní, aby šel vidět i pod kalnou vodou) – výška
 * středu modelu nad hladinou při měřítku 1 (m) a pevná rezerva (m, ve scéně): hladina podél
 * dráhy klesá po proudu (s převýšením i o desítky cm) a ryba se pod ni nesmí zanořit.
 */
const FISH_FLOAT_M = 0.13;
const FISH_FLOAT_BASE_M = 0.35;
/** I u hladiny ryby trochu zakrývá voda. */
const FISH_OPACITY_MAX = 0.95;
/**
 * Skok ryby nad hladinu (0 A.D. fish_generic, kosti jump_*): v každém úseku (s) s danou
 * pravděpodobností vyskočí jedna ryba hejna – výška (m) a délka skoku (s).
 */
const JUMP_SLOT_S = 16;
const JUMP_CHANCE = 0.55;
const JUMP_HEIGHT_M = 0.6;
const JUMP_S = 0.7;

export function createPose(): FaunaPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    forwardX: 0,
    forwardY: 0,
    forwardZ: 1,
    tiltX: 0,
    tiltZ: 0,
    flap: 0,
    opacity: 1,
  };
}

/** Pták `index` hejna v čase `timeS` (s): krouží, v zatáčce se naklání, mává nebo plachtí. */
export function birdPose(
  flock: BirdFlock,
  index: number,
  timeS: number,
  out: FaunaPose,
): FaunaPose {
  const bird = flock.birds[index]!;
  const omega = (flock.turn * flock.speedMps) / flock.radiusM;
  const theta = bird.phase + omega * timeS;
  const radius =
    flock.radiusM *
    bird.radius *
    (1 + BIRD_RADIUS_WOBBLE * Math.sin(WOBBLE_RATE * timeS + bird.phase * 3));
  const drift = flock.driftM * 0.7;
  const cx = flock.x + drift * Math.sin((2 * Math.PI * timeS) / DRIFT_PERIOD_S[0] + flock.seed);
  const cz = flock.z + drift * Math.cos((2 * Math.PI * timeS) / DRIFT_PERIOD_S[1] + flock.seed);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  out.x = cx + radius * cos;
  out.z = cz + radius * sin;
  out.y = flock.y + bird.heightM + BOB_M * Math.sin(BOB_RATE * timeS + bird.phase * 2);
  out.forwardX = -flock.turn * sin;
  out.forwardY = 0;
  out.forwardZ = flock.turn * cos;
  // Náklon jako u skutečného letu v zatáčce: tan(náklon) = v² / (g · r).
  const speed = Math.abs(omega) * radius;
  const bank = Math.atan((speed * speed) / (G * radius));
  out.tiltX = -cos * Math.sin(bank);
  out.tiltZ = -sin * Math.sin(bank);
  out.flap = wingBeat(flock, index, timeS);
  out.opacity = 1;
  return out;
}

function wingBeat(flock: BirdFlock, index: number, timeS: number): number {
  const style = FLAP[flock.species];
  const salt = flock.seed * 16 + index;
  const phase = flock.birds[index]!.phase * 7;
  const offset = hash(salt, 0, 501) * style.slotS;
  const slot = Math.floor((timeS + offset) / style.slotS);
  const local = timeS + offset - slot * style.slotS;
  const flapsNow = hash(salt, slot, 502) < style.chance ? 1 : 0;
  const flappedBefore = hash(salt, slot - 1, 502) < style.chance ? 1 : 0;
  const amount = flappedBefore + (flapsNow - flappedBefore) * smoothstep(0, style.rampS, local);
  const beat = Math.sin(2 * Math.PI * style.hz * timeS + phase);
  const glide =
    style.glide * (0.5 - 0.5 * Math.cos((2 * Math.PI * timeS) / style.glidePeriodS + phase));
  return amount * beat + (1 - amount) * glide;
}

/**
 * Ryba `index` hejna v čase `timeS` (s): hejno krouží po elipse, chvíli rychleji, chvíli
 * pomaleji, ryby mrskají ocasem podle uplavané dráhy a občas některá vyskočí nad hladinu.
 */
export function fishPose(
  school: FishSchool,
  index: number,
  timeS: number,
  out: FaunaPose,
): FaunaPose {
  const fish = school.fish[index]!;
  // Všechny ryby hejna mají stejnou úhlovou rychlost – hejno drží pohromadě.
  const meanRadius = (school.alongM + school.acrossM) / 2;
  const omega = school.speedMps / meanRadius;
  const rate = (2 * Math.PI) / FISH_SURGE_PERIOD_S;
  const surgePhase = school.seed * 1.7;
  const travelled =
    omega * timeS - ((FISH_SURGE * omega) / rate) * (Math.cos(rate * timeS + surgePhase) - 1);
  const theta = fish.phase + school.turn * travelled;
  fishLoopPoint(school, fish.radius, theta, out);
  // Tečna elipsy (derivace podle úhlu) ve směru plavání.
  const along = -Math.sin(theta) * school.alongM;
  const across = Math.cos(theta) * school.acrossM;
  const tx = school.turn * (school.flowX * along - school.flowZ * across);
  const tz = school.turn * (school.flowZ * along + school.flowX * across);
  const length = Math.hypot(tx, tz);
  out.forwardX = tx / length;
  out.forwardY = 0;
  out.forwardZ = tz / length;
  out.tiltX = 0;
  out.tiltZ = 0;
  const distance = travelled * fish.radius * meanRadius;
  out.flap = Math.sin((2 * Math.PI * distance) / (FISH_STRIDE_M * fish.scale) + fish.phase * 5);
  const underwater = FISH_OPACITY_MAX * Math.exp(-fish.depthM / school.visibilityM);
  out.y = school.surfaceY + FISH_FLOAT_M * fish.scale + FISH_FLOAT_BASE_M;
  out.opacity = underwater;

  const jump = jumpProgress(school, index, timeS);
  if (jump >= 0) {
    const lift = JUMP_HEIGHT_M * 4 * jump * (1 - jump);
    const climb = (JUMP_HEIGHT_M * 4 * (1 - 2 * jump)) / JUMP_S;
    const speed =
      omega * (1 + FISH_SURGE * Math.sin(rate * timeS + surgePhase)) * fish.radius * length;
    const norm = Math.hypot(speed, climb);
    out.forwardX *= speed / norm;
    out.forwardZ *= speed / norm;
    out.forwardY = climb / norm;
    out.y += lift;
    out.opacity = underwater + (1 - underwater) * smoothstep(0, 0.12, lift);
  }
  return out;
}

/** Průběh skoku ryby 0–1, nebo −1, když ryba právě neskáče. */
function jumpProgress(school: FishSchool, index: number, timeS: number): number {
  const offset = hash(school.seed, 0, 511) * JUMP_SLOT_S;
  const slot = Math.floor((timeS + offset) / JUMP_SLOT_S);
  if (hash(school.seed, slot, 512) >= JUMP_CHANCE) return -1;
  const jumper = Math.floor(hash(school.seed, slot, 513) * school.fish.length);
  if (jumper !== index) return -1;
  const start = slot * JUMP_SLOT_S - offset + hash(school.seed, slot, 514) * (JUMP_SLOT_S - JUMP_S);
  const progress = (timeS - start) / JUMP_S;
  return progress >= 0 && progress <= 1 ? progress : -1;
}

export function birdFlockBounds(flock: BirdFlock): Bounds {
  const reach = flockReach(flock) + 1;
  const heights = flock.birds.map((b) => b.heightM);
  return {
    minX: flock.x - reach,
    maxX: flock.x + reach,
    minZ: flock.z - reach,
    maxZ: flock.z + reach,
    minY: flock.y + Math.min(...heights) - BOB_M - 2,
    maxY: flock.y + Math.max(...heights) + BOB_M + 2,
  };
}

export function fishSchoolBounds(school: FishSchool): Bounds {
  const widest = Math.max(...school.fish.map((f) => f.radius));
  const reach = Math.max(school.alongM, school.acrossM) * widest + 1;
  return {
    minX: school.x - reach,
    maxX: school.x + reach,
    minZ: school.z - reach,
    maxZ: school.z + reach,
    minY: school.surfaceY - 0.5,
    maxY: school.surfaceY + FISH_FLOAT_M * 1.5 + FISH_FLOAT_BASE_M + JUMP_HEIGHT_M + 0.5,
  };
}

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
