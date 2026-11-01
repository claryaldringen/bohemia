import type { HerdSpecies } from '@bohemia/game';
import { LIVESTOCK_EPOCH_MS } from './livestock-motion';
import { hash01 } from './smoke-schedule';

// Pohyb postav ve vsi jako čistá funkce skutečného času (jako domácí zvířata –
// livestock-motion.ts): scéna jen dosadí čas a přepíše instance. Práce v řadě po poli, chůze
// tam a zpět po trase (nosiči), stání u domu a pasáček u stáda. Stejný okamžik = stejná póza,
// nic se nepočítá postupně; ve zrychleném světě se lidé hýbou stejně klidně (skutečný čas).

export type VillagerKind = 'woman' | 'man';
/** Klipy animací v GLB (tools/blender/people.json). */
export type VillagerClip =
  | 'walk'
  | 'idle'
  | 'reap'
  | 'hoe'
  | 'seed'
  | 'weed'
  | 'carry'
  | 'carry-wood'
  | 'fell'
  | 'build'
  | 'fruit'
  | 'carry-water'
  | 'water-idle'
  // porážka (diet.md – Porážka ve scéně): řezník s nožem v kleku a vestoje, žena s miskou, nošení masa
  | 'butcher'
  | 'bleed'
  | 'gut'
  | 'carry-meat'
  | 'carry-meat-idle'
  | 'fish'
  // dítě s řehtačkou na hlídaném dílu (wildlife.md – Ve scéně): řehtačka zvednutá v pravé ruce
  | 'walk-rattle'
  | 'idle-rattle'
  // humno (production-chains.md – Humno): úder mlatcí holí oběma rukama shora, prohazování
  // zrna dřevěnou lopatou proti větru
  | 'thresh'
  | 'winnow'
  // jezdec a výcvik vojvodovy rodiny (horses.md, lord.md) – jen `man.glb`
  | 'ride'
  | 'ride-trot'
  | 'ride-idle'
  | 'bow-draw'
  | 'bow-release'
  | 'spear-thrust'
  // pěší lovec cestou k lesu a zpět s oštěpem (chůze kopiníka z 0 A.D.) – jen `man.glb`
  | 'walk-spear'
  | 'sword-strike'
  | 'shield-block'
  // další klipy 0 A.D. (villagers.md – Pro implementaci, úloha 10): modlitba u modly a svatyně
  // (ruce k nebi), léčení, varianty odpočinkového stání (`rest-c`–`rest-e` jen `man.glb` – žena
  // místo nich stojí klipem `idle`), cesta s motykou a sekerou na rameni
  | 'pray'
  | 'heal'
  | 'rest-a'
  | 'rest-b'
  | 'rest-c'
  | 'rest-d'
  | 'rest-e'
  | 'walk-hoe'
  | 'walk-axe'
  // vojvoda: stání se založenýma rukama a chůze vladaře (idle_minister, walk_relax_minister) – jen
  // `man.glb`
  | 'lord-idle-a'
  | 'lord-idle-b'
  | 'lord-idle-c'
  | 'walk-lord'
  // vlastní klipy z klíčových póz (CC0, people_from_0ad.py `keyed_frames`) – v 0 A.D. chybí:
  // dojení a sezení na špalku, předení, tkaní, sed u hrnčířského kruhu, píšťala a buben
  | 'milk'
  | 'spin'
  | 'weave'
  | 'sit'
  | 'wheel'
  | 'pipe'
  | 'drum';

/** Všechny klipy – GLB je musí mít (people.json, hlídá test). */
export const VILLAGER_CLIPS: readonly VillagerClip[] = [
  'walk',
  'idle',
  'reap',
  'hoe',
  'seed',
  'weed',
  'carry',
  'carry-wood',
  'fell',
  'build',
  'fruit',
  // pro vodu s vahadlem a vědry (provoz na cestách – villagers.md): chůze a stání
  'carry-water',
  'water-idle',
  // porážka: nůž v kleku (butcher) a vestoje (gut), miska (bleed), kýta na rameni
  'butcher',
  'bleed',
  'gut',
  'carry-meat',
  'carry-meat-idle',
  'fish',
  'walk-rattle',
  'idle-rattle',
  'thresh',
  'winnow',
  // jezdec (sed na koni) a výcvik s dřevěnými zbraněmi – klipy má jen `man.glb`
  'ride',
  'ride-trot',
  'ride-idle',
  'bow-draw',
  'bow-release',
  'spear-thrust',
  'walk-spear',
  'sword-strike',
  'shield-block',
  'pray',
  'heal',
  'rest-a',
  'rest-b',
  'rest-c',
  'rest-d',
  'rest-e',
  'walk-hoe',
  'walk-axe',
  'lord-idle-a',
  'lord-idle-b',
  'lord-idle-c',
  'walk-lord',
  'milk',
  'spin',
  'weave',
  'sit',
  'wheel',
  'pipe',
  'drum',
];

/** Klipy jen v `man.glb` (žena místo nich hraje `idle` – villagers.ts). */
export const MAN_ONLY_CLIPS: readonly VillagerClip[] = [
  'ride',
  'ride-trot',
  'ride-idle',
  'bow-draw',
  'bow-release',
  'spear-thrust',
  'walk-spear',
  'sword-strike',
  'shield-block',
  'rest-c',
  'rest-d',
  'rest-e',
  'lord-idle-a',
  'lord-idle-b',
  'lord-idle-c',
  'walk-lord',
];

/** Varianty odpočinkového stání (starší u domu – villager-phases.ts); žena má jen `rest-a/b`. */
export const REST_CLIPS: readonly VillagerClip[] = [
  'rest-a',
  'rest-b',
  'rest-c',
  'rest-d',
  'rest-e',
];

/** Stání vojvody – střídá se po `LORD_IDLE_S` (villager-plan-lord.ts). */
export const LORD_IDLE_CLIPS: readonly VillagerClip[] = [
  'lord-idle-a',
  'lord-idle-b',
  'lord-idle-c',
];

/**
 * Cesta k práci a domů s nářadím na rameni (0 A.D. walk_hoe, walk_axe): klip práce → klip chůze.
 */
export const TOOL_WALK: Partial<Record<VillagerClip, VillagerClip>> = {
  hoe: 'walk-hoe',
  fell: 'walk-axe',
};

/** Klip chůze (nohy jdou tempem podle rychlosti klipu – villagers.ts). */
export function isWalkClip(clip: VillagerClip): boolean {
  return clip === 'walk' || clip === 'walk-hoe' || clip === 'walk-axe' || clip === 'walk-lord';
}

/** Čas postav (s) ve skutečný okamžik `nowMs` – stejný počátek jako zvířata. */
export function villagerSeconds(nowMs: number): number {
  return (nowMs - LIVESTOCK_EPOCH_MS) / 1000;
}

/** Okamžitý stav postavy (výšku podle terénu doplní scéna). */
export interface VillagerPose {
  x: number;
  z: number;
  /** Kam postava hledí (vodorovně, jednotkový vektor). */
  headingX: number;
  headingZ: number;
  clip: VillagerClip;
  /** Rychlost přehrávání klipu (1 = jak je zapečený). */
  pace: number;
  /**
   * Postava teď není vidět (karavana výpravy za krajem mapy – caravan.ts); scéna ji nekreslí.
   * Bez údaje vidět.
   */
  hidden?: boolean;
  /**
   * Kde v pochůzce postava je (panel postavy – villagers.md, Výběr postavy): cesta tam, na konci,
   * zpět, doma (`shuttle`); karavana tam, zpátky, čeká u začátku stezky; pohřeb u hranice, cestou
   * domů. Bez údaje – dělá svou práci (v průvodu jde za márami).
   */
  stage?: VillagerStage;
  /**
   * O kolik je postava výš nad zemí (m) – jezdec na koni sedí ve výšce sedla (riders.ts). Jen posun
   * matice instance, žádný vertex atribut. Bez údaje na zemi.
   */
  lift?: number;
}

/** Úsek pochůzky postavy (`VillagerPose.stage`). */
export type VillagerStage =
  | 'out'
  | 'end'
  | 'back'
  | 'rest'
  | 'wait'
  | 'ring'
  | 'home'
  // výcvik vojvodovy rodiny (lord.md): střílí z luku, bojuje
  | 'bow'
  | 'combat';

export function createVillagerPose(): VillagerPose {
  return { x: 0, z: 0, headingX: 0, headingZ: 1, clip: 'idle', pace: 1 };
}

/** Stádo, u kterého je pasáček: střed, poloměr a stěhování (livestock-motion HerdState). */
export interface HerdView {
  x: number;
  z: number;
  radiusM: number;
  /** Pase se s pasákem; false = stojí u domu bez pasáka (bez údaje s pasákem). */
  tended?: boolean;
  moving: number;
  headingX: number;
  headingZ: number;
  /** Kterých zvířat je ve stádě nejvíc – pasák „pase ovce“ (villagers.md – Výběr postavy). */
  species?: HerdSpecies;
}

/** Póza postavy v čase `t` (s, villagerSeconds) – zapisuje do `out`, nic nealokuje. */
export type PoseFn = (t: number, herds: readonly HerdView[], out: VillagerPose) => VillagerPose;

/**
 * Rychlost chůze (m/s) při přehrávání klipu rychlostí 1 a měřítku 1 – ať nohy neklouzají
 * (změřeno z GLB jako v prvním náhledu postav). Zmenšená postava jde pomaleji.
 */
export const CLIP_SPEED_M_S: Record<VillagerKind, Partial<Record<VillagerClip, number>>> = {
  // s vahadlem chůze jako `walk` (stejná animace, ruce drží provazy – people.json); s masem jako
  // s dřevem (stejná kadence 1,25 s na dvojkrok a rozkmit stehna – carry_meat z 0 A.D.); s řehtačkou
  // jako `walk` (stejná animace), chůze kopiníka o 4 % pomaleji (people_from_0ad.py: 0,83 a 0,86 m/s)
  woman: {
    walk: 1.25,
    carry: 1.05,
    'carry-wood': 1.05,
    'carry-water': 1.25,
    'carry-meat': 1.05,
    'walk-rattle': 1.25,
    // chůze s nářadím z 0 A.D. (people_from_0ad.py: 0,88 m/s muž při chůzi 0,86) – žena podle výšky
    'walk-hoe': 0.95,
    'walk-axe': 0.95,
  },
  man: {
    walk: 1.0,
    carry: 1.1,
    'carry-wood': 1.0,
    'carry-water': 1.0,
    'carry-meat': 1.0,
    'walk-rattle': 1.0,
    'walk-spear': 0.97,
    'walk-hoe': 1.02,
    'walk-axe': 1.02,
    // chůze vladaře (people_from_0ad.py: 1,04 m/s při chůzi 0,86)
    'walk-lord': 1.2,
  },
};

/** Rychlost chůze postavy v klipu `clip` (m/s) – podle druhu a měřítka. */
export function walkSpeed(kind: VillagerKind, clip: VillagerClip, scale: number): number {
  return (CLIP_SPEED_M_S[kind][clip] ?? CLIP_SPEED_M_S[kind].walk ?? 1) * scale;
}

function set(
  out: VillagerPose,
  x: number,
  z: number,
  hx: number,
  hz: number,
  clip: VillagerClip,
  pace = 1,
): VillagerPose {
  out.x = x;
  out.z = z;
  out.headingX = hx;
  out.headingZ = hz;
  out.clip = clip;
  out.pace = pace;
  return out;
}

/** Postava stojí na místě a dělá `clip` (hledí ve směru hx, hz). */
export function stand(
  x: number,
  z: number,
  hx: number,
  hz: number,
  clip: VillagerClip,
  pace = 1,
): PoseFn {
  return (_t, _herds, out) => set(out, x, z, hx, hz, clip, pace);
}

/**
 * Přechod na nové místo práce (Martin: když je čtverec hotový, panáček dojde na další): od času
 * `startS` jde postava rovně z (fromX, fromZ) rychlostí `speed` tam, kde ji v čase příchodu
 * čeká póza `next`, a odtud pokračuje podle ní. Cíl se dopočítá dvakrát (práce v řadě se mezitím
 * posune), zbylý skok je pod krok řady.
 */
export function walkThen(
  fromX: number,
  fromZ: number,
  next: PoseFn,
  startS: number,
  speed: number,
): PoseFn {
  const probe = createVillagerPose();
  const v = Math.max(0.1, speed);
  next(startS, [], probe);
  let arrive = startS + Math.hypot(probe.x - fromX, probe.z - fromZ) / v;
  next(arrive, [], probe);
  arrive = startS + Math.hypot(probe.x - fromX, probe.z - fromZ) / v;
  next(arrive, [], probe);
  const toX = probe.x;
  const toZ = probe.z;
  const length = Math.hypot(toX - fromX, toZ - fromZ);
  const hx = length > 1e-6 ? (toX - fromX) / length : 0;
  const hz = length > 1e-6 ? (toZ - fromZ) / length : 1;
  return (t, herds, out) => {
    if (t >= arrive || length < 1e-6) return next(t, herds, out);
    const d = Math.max(0, t - startS) * v;
    return set(out, fromX + hx * d, fromZ + hz * d, hx, hz, 'walk');
  };
}

/** Úsek řady na čtverci: od (ax, az) do (bx, bz). */
export interface Lane {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/**
 * Práce v řadě (okopávání, setí, pletí, žeň): `workS` sekund `clip` na místě, pak popojde
 * o `stepM` (chůze rychlostí `speed`); na konci řady se otočí a jde zpět. `phase` (0–1)
 * rozhodí sousedy v čase i v řadě.
 */
export function rowWork(
  lane: Lane,
  clip: VillagerClip,
  workS: number,
  stepM: number,
  speed: number,
  phase: number,
): PoseFn {
  const length = Math.hypot(lane.bx - lane.ax, lane.bz - lane.az);
  const dx = length > 1e-6 ? (lane.bx - lane.ax) / length : 0;
  const dz = length > 1e-6 ? (lane.bz - lane.az) / length : 1;
  const walkS = stepM / Math.max(0.1, speed);
  const stepS = workS + walkS;
  const steps = Math.max(1, Math.floor(length / stepM));
  const shift = phase * steps * 2 * stepS;
  return (t, _herds, out) => {
    const time = t + shift;
    const k = Math.floor(time / stepS);
    const within = time - k * stepS;
    const back = Math.floor(k / steps) % 2 === 1;
    const step = k % steps;
    const walking = within > workS;
    const progress = (step + (walking ? (within - workS) / walkS : 0)) * stepM;
    const along = back ? length - progress : progress;
    const heading = back ? -1 : 1;
    return set(
      out,
      lane.ax + dx * along,
      lane.az + dz * along,
      dx * heading,
      dz * heading,
      walking ? 'walk' : clip,
    );
  };
}

/** Trasa jako lomená čára s délkami úseků. */
export interface Route {
  points: readonly (readonly [number, number])[];
  /** Kumulativní délka do každého bodu (první 0). */
  at: readonly number[];
  length: number;
  /**
   * Tempo úseků (násobek rychlosti chůze; po vyšlapané pěšině víc než 1 – paths.md) a délka
   * chůze do každého bodu (délka ÷ tempo) – bez tempa jako délka.
   */
  pace?: readonly number[];
  walkAt?: readonly number[];
  walkLength?: number;
}

export function route(
  points: readonly (readonly [number, number])[],
  pace?: readonly number[],
): Route {
  const at = [0];
  const walkAt = [0];
  let length = 0;
  let walk = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const segment = Math.hypot(bx - ax, bz - az);
    length += segment;
    walk += segment / Math.max(0.1, pace?.[i - 1] ?? 1);
    at.push(length);
    walkAt.push(walk);
  }
  return pace ? { points, at, length, pace, walkAt, walkLength: walk } : { points, at, length };
}

/** Délka chůze trasy (s tempem úseků – po pěšině kratší). */
function walkLengthOf(r: Route): number {
  return r.walkLength ?? r.length;
}

/**
 * Bod trasy po `w` metrech chůze (s tempem úseků) a směr úseku (do `out`); vrátí tempo úseku –
 * po pěšině jde postava rychleji a rychleji i kráčí.
 */
function alongRouteWalk(r: Route, w: number, reverse: boolean, out: VillagerPose): number {
  if (!r.walkAt || !r.pace) {
    alongRoute(r, w, reverse, out);
    return 1;
  }
  const walk = Math.min(walkLengthOf(r), Math.max(0, w));
  let i = 1;
  while (i < r.points.length - 1 && r.walkAt[i]! < walk) i++;
  const span = Math.max(1e-6, r.walkAt[i]! - r.walkAt[i - 1]!);
  const u = Math.min(1, Math.max(0, (walk - r.walkAt[i - 1]!) / span));
  alongRoute(r, r.at[i - 1]! + (r.at[i]! - r.at[i - 1]!) * u, reverse, out);
  return r.pace[i - 1] ?? 1;
}

/** Bod trasy ve vzdálenosti `d` od začátku a směr úseku (do `out`, klip a tempo nemění). */
export function alongRoute(r: Route, d: number, reverse: boolean, out: VillagerPose): void {
  const distance = Math.min(r.length, Math.max(0, d));
  let i = 1;
  while (i < r.points.length - 1 && r.at[i]! < distance) i++;
  const [ax, az] = r.points[i - 1]!;
  const [bx, bz] = r.points[i]!;
  const segment = Math.max(1e-6, r.at[i]! - r.at[i - 1]!);
  const u = Math.min(1, Math.max(0, (distance - r.at[i - 1]!) / segment));
  out.x = ax + (bx - ax) * u;
  out.z = az + (bz - az) * u;
  const hx = (bx - ax) / segment;
  const hz = (bz - az) / segment;
  out.headingX = reverse ? -hx : hx;
  out.headingZ = reverse ? -hz : hz;
}

export interface ShuttleOptions {
  /** Cesta tam (klip, rychlost m/s), práce na konci (klip, s), cesta zpět, odpočinek na začátku. */
  outClip: VillagerClip;
  outSpeed: number;
  endClip: VillagerClip;
  endS: number;
  backClip: VillagerClip;
  backSpeed: number;
  restClip: VillagerClip;
  restS: number;
  phase: number;
  /**
   * Odpočinek na začátku trasy je doma – postava není vidět (provoz na cestách: zajde do domu
   * a zase vyjde – villagers.md); bez údaje stojí venku (`restClip`).
   */
  restHidden?: boolean;
}

/**
 * Cyklus `shuttle` v čase postav (villagers.md – Pochůzka se dokončí): čas v cyklu je
 * (t + `shiftS`) mod `cycleS`; od 0 jde tam, pracuje, vrací se a od `homeS` je doma (odpočívá).
 */
export interface ShuttleCycle {
  cycleS: number;
  shiftS: number;
  homeS: number;
}

export function shuttleCycle(
  r: Route,
  o: Pick<ShuttleOptions, 'outSpeed' | 'endS' | 'backSpeed' | 'restS' | 'phase'>,
): ShuttleCycle {
  // po vyšlapané pěšině se jde rychleji (tempo úseků) – cesta trvá podle délky chůze
  const walk = walkLengthOf(r);
  const homeS = walk / Math.max(0.1, o.outSpeed) + o.endS + walk / Math.max(0.1, o.backSpeed);
  const cycleS = homeS + o.restS;
  return { cycleS, shiftS: o.phase * cycleS, homeS };
}

/**
 * Chůze tam a zpět po trase (nosič úrody, dřeva, vody): tam s `outClip`, na konci `endClip`
 * (nakládá), zpět s nákladem (`backClip`), na začátku chvíli stojí. Na koncích hledí podél
 * trasy ven.
 */
export function shuttle(r: Route, o: ShuttleOptions): PoseFn {
  const walk = walkLengthOf(r);
  const outS = walk / Math.max(0.1, o.outSpeed);
  const backS = walk / Math.max(0.1, o.backSpeed);
  const { cycleS: cycle, shiftS: shift } = shuttleCycle(r, o);
  return (t, _herds, out) => {
    const time = (((t + shift) % cycle) + cycle) % cycle;
    out.pace = 1;
    if (time < outS) {
      out.pace = alongRouteWalk(r, (time / outS) * walk, false, out);
      out.clip = o.outClip;
      out.stage = 'out';
    } else if (time < outS + o.endS) {
      alongRoute(r, r.length, false, out);
      out.clip = o.endClip;
      out.stage = 'end';
    } else if (time < outS + o.endS + backS) {
      out.pace = alongRouteWalk(r, (1 - (time - outS - o.endS) / backS) * walk, true, out);
      out.clip = o.backClip;
      out.stage = 'back';
    } else {
      alongRoute(r, 0, true, out);
      out.clip = o.restClip;
      out.stage = 'rest';
      if (o.restHidden) out.hidden = true;
    }
    return out;
  };
}

/**
 * Pasáček (dítě) u stáda `index`: každých 25 s si vybere jiné místo kolem stáda a dojde tam
 * (`speed` m/s, `pace` přehrávání chůze); když se stádo stěhuje, jde s ním. Bez stáda (ještě
 * nenačtená zvířata) stojí na místě `home`.
 */
export function herder(
  index: number,
  home: { x: number; z: number },
  seed: number,
  phase: number,
  speed: number,
  pace: number,
): PoseFn {
  const slotS = 25;
  const spot = (k: number, radius: number, axis: 0 | 1): number => {
    const angle = hash01(seed, k, 81) * Math.PI * 2;
    const r = radius + 2 + hash01(seed, k, 82) * 3;
    return axis === 0 ? Math.cos(angle) * r : Math.sin(angle) * r;
  };
  return (t, herds, out) => {
    const herd = herds[index];
    if (!herd) return set(out, home.x, home.z, 0, 1, 'idle');
    const time = t + phase * slotS;
    const k = Math.floor(time / slotS);
    const within = time - k * slotS;
    const ax = spot(k - 1, herd.radiusM, 0);
    const az = spot(k - 1, herd.radiusM, 1);
    const bx = spot(k, herd.radiusM, 0);
    const bz = spot(k, herd.radiusM, 1);
    const d = Math.hypot(bx - ax, bz - az);
    const walkS = d / speed;
    const u = walkS > 0 ? Math.min(1, within / walkS) : 1;
    const x = herd.x + ax + (bx - ax) * u;
    const z = herd.z + az + (bz - az) * u;
    if (herd.moving > 0.3) return set(out, x, z, herd.headingX, herd.headingZ, 'walk', pace);
    if (u < 1 && d > 1e-6) return set(out, x, z, (bx - ax) / d, (bz - az) / d, 'walk', pace);
    // stojí čelem ke stádu
    const back = Math.hypot(bx, bz);
    return back > 1e-6
      ? set(out, x, z, -bx / back, -bz / back, 'idle')
      : set(out, x, z, 0, 1, 'idle');
  };
}

/**
 * Postava u domu: `standS` sekund stojí (idle), pak dojde pro vodu nebo dřevo po trase
 * a s nákladem se vrátí (`shuttle` bez práce na konci by vypadal jako bloudění – chvíli se
 * u cíle shýbá).
 */
export function fetcher(
  r: Route,
  kind: VillagerKind,
  scale: number,
  standS: number,
  phase: number,
): PoseFn {
  return shuttle(r, {
    outClip: 'walk',
    outSpeed: walkSpeed(kind, 'walk', scale),
    endClip: 'weed',
    endS: 4,
    backClip: 'carry',
    backSpeed: walkSpeed(kind, 'carry', scale),
    restClip: 'idle',
    restS: standS,
    phase,
  });
}
