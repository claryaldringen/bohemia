// Karavana výpravy k sousedovi ve scéně (docs/design/trade.md – Ve scéně; Martin 19. 10. 2026:
// „Měl bych vidět skupinu lidí, jak jde po té zemské stezce s nákladem pro sousední vesnici.
// Zpátky by se mělo vracet o dva lidi víc, když jsem si je objednal. Až bude vůz, pojedou zásoby
// na voze a ušetří se člověkodny.“). Čisté funkce bez Babylonu: kde na zemské stezce karavana je
// (jedna skupina, ne proud nosičů), kdo v ní jde tam a kdo zpátky a kde stojí každý člen.
//
// Časový rozvrh (návrh Clauda; villagers.md – Činnosti od začátku do konce, Martin 31. 10. 2026:
// „Ve vykreslování by lidé měli dělat své činnosti od začátku do konce“): karavana vyrazí se
// začátkem herního dne, kdy cesta začala (`SceneExpedition.startDay`), a jde ve skutečném čase
// přirozenou chůzí – lidé běžnou chůzí, s vozy nebo dobytkem tempem volů (`caravanSpeed`), žádný
// časosběr. Za krajem mapy je herní den u souseda, pak se vrací
// stejným tempem. Jádro výpravu počítá dál po dnech a vrátí se dřív – scéna si běžící karavanu
// pamatuje do jejího návratu (activity-memory.ts), naráz jich tak může jít víc.
// Dobytek (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026: „s dobytkem by také mělo jít
// obchodovat“) jde po svých za vozy po dvou vedle sebe – prodaný tam, koupený zpátky – a za ním
// honák (nosič výpravy); kreslí ho stádo vsi (livestock.ts) podle týchž míst jako lidi.
import type { SceneExpedition } from '../village-view';

/**
 * Body cesty karavany: zemská stezka výpravy, nebo čára krajinou ke kraji mapy (nákup u souseda
 * bez stezky – crafts.md, Nákup u sousedů); bez nich prázdné.
 */
export function caravanPoints(
  e: Pick<SceneExpedition, 'trailId' | 'line'>,
  trails: readonly { id: number; points: readonly { x: number; z: number }[] }[] | undefined,
): readonly { x: number; z: number }[] {
  if (e.line) return e.line;
  return (trails ?? []).find((t) => t.id === e.trailId)?.points ?? [];
}

/** Rozestup lidí v karavaně (m, postavy jsou zvětšené), vozů a řad dobytka za sebou (m). */
export const CARAVAN_GAP_M = { person: 1.9, cart: 9, animal: 3.2 } as const;
/** Dobytek jde po dvou vedle sebe – vlevo a vpravo od osy (m). */
export const CARAVAN_ANIMAL_SIDE_M = 0.95;
/** Pomocník u vozu jde vedle něj (m vlevo od osy). */
export const CART_HELPER_SIDE_M = 1.7;

/** Okno herního dne (skutečný čas, ms). */
export interface DayWindow {
  startMs: number;
  endMs: number;
}

/** Kdo v karavaně jde a jak. */
export type CaravanRole = 'porter' | 'helper' | 'leaving' | 'coming';

/** Člen karavany: kdo, jak daleko za čelem (m), vedle osy (m) a pohlaví a věk (postava). */
export interface CaravanMember {
  key: string;
  role: CaravanRole;
  /** Vzdálenost za čelem karavany (m) – u vozu a pomocníka kolikátý vůz. */
  behind: number;
  side: number;
  /** Pohlaví a věk – lidé, kteří se stěhují (z jádra); u nosičů a pomocníků null (jak padne). */
  sex: 'male' | 'female' | null;
  age: number | null;
  /** Nese náklad (nosič na cestě se zbožím). */
  loaded: boolean;
}

/** Kus dobytka v karavaně: kráva nebo vůl, jak daleko za čelem (m) a vedle osy (m). */
export interface CaravanAnimal {
  key: string;
  kind: 'cow' | 'ox';
  behind: number;
  side: number;
}

/** Karavana jedním směrem: lidé, vozy (vzdálenost za čelem), dobytek a délka zástupu. */
export interface CaravanColumn {
  members: CaravanMember[];
  carts: number[];
  animals: CaravanAnimal[];
  length: number;
}

/** Kdo jde tam (nosiči a pomocníci u vozů, lidé, kteří odcházejí) a kdo zpátky (s přišlými). */
export interface CaravanPlan {
  out: CaravanColumn;
  back: CaravanColumn;
}

/** Kolik lidí s vozy jde vedle vozu (honák je u spřežení – kreslí ho vůz). */
function helpersPerCart(): number {
  return 1;
}

/**
 * Zástup jedním směrem: vozy v čele (po CARAVAN_GAP_M.cart), u každého pomocník vedle, za nimi
 * dobytek po dvou (krávy, pak voli), za ním nosiči s nákladem (`loaded`) – s dobytkem i honák –,
 * na konci lidé, kteří se stěhují (bez nákladu).
 */
function column(
  e: SceneExpedition,
  direction: 'out' | 'back',
  people: SceneExpedition['leaving'],
  loaded: boolean,
): CaravanColumn {
  const carts = e.carts.map((_, i) => i * CARAVAN_GAP_M.cart);
  const members: CaravanMember[] = [];
  e.carts.forEach((_, i) => {
    for (let h = 0; h < helpersPerCart(); h++) {
      members.push({
        key: `${direction}:helper:${i}:${h}`,
        role: 'helper',
        behind: i * CARAVAN_GAP_M.cart,
        side: CART_HELPER_SIDE_M,
        sex: null,
        age: null,
        loaded: false,
      });
    }
  });
  // lidé výpravy bez vozů nesou náklad; s vozy jde s každým vozem honák (u spřežení) a pomocník
  const walkers = Math.max(0, e.porters - e.carts.length * e.cartCrew);
  let behind = e.carts.length > 0 ? e.carts.length * CARAVAN_GAP_M.cart : 0;
  // dobytek po dvou za vozy, honák (první nosič) za ním
  const herd = e.cattle?.[direction] ?? { cows: 0, oxen: 0 };
  const kinds = [...Array<'cow'>(herd.cows).fill('cow'), ...Array<'ox'>(herd.oxen).fill('ox')];
  const animals: CaravanAnimal[] = kinds.map((kind, i) => ({
    key: `${direction}:animal:${i}`,
    kind,
    behind: behind + Math.floor(i / 2) * CARAVAN_GAP_M.animal,
    side: kinds.length === 1 ? 0 : i % 2 === 0 ? CARAVAN_ANIMAL_SIDE_M : -CARAVAN_ANIMAL_SIDE_M,
  }));
  if (animals.length > 0) behind += Math.ceil(animals.length / 2) * CARAVAN_GAP_M.animal;
  for (let i = 0; i < walkers; i++) {
    members.push({
      key: `${direction}:porter:${i}`,
      role: 'porter',
      behind,
      side: 0,
      sex: null,
      age: null,
      loaded,
    });
    behind += CARAVAN_GAP_M.person;
  }
  people.forEach((p, i) => {
    members.push({
      key: `${direction}:${direction === 'out' ? 'leaving' : 'coming'}:${i}`,
      role: direction === 'out' ? 'leaving' : 'coming',
      behind,
      side: 0,
      sex: p.sex,
      age: p.age,
      loaded: false,
    });
    behind += CARAVAN_GAP_M.person;
  });
  return { members, carts, animals, length: Math.max(0, behind - CARAVAN_GAP_M.person) };
}

/**
 * Kdo v karavaně jde: tam nosiči se zbožím (s vozy jen pomocníci u vozů – náklad veze vůz),
 * prodaný dobytek a lidé, které ves dává sousedovi; zpátky tíž nosiči (s nákladem, jen když
 * výprava něco veze), koupený dobytek a lidé od souseda, kteří s výpravou přijdou.
 */
export function caravanPlan(e: SceneExpedition): CaravanPlan {
  return {
    out: column(e, 'out', e.leaving, e.carriesOut),
    back: column(e, 'back', e.coming, e.carriesBack),
  };
}

/**
 * Rychlost karavany (m/s): lidé běžnou chůzí (muž 1,0 m/s × měřítko postavy 1,2 – ženy jdou
 * s nimi o kus pomaleji, než by šly samy), s vozy nebo dobytkem tempem volů (CART_SPEED_M_S
 * v cart-layout.ts).
 */
export const CARAVAN_SPEED_M_S = { walk: 1.2, oxen: 0.85 } as const;
/** Po návratu stojí karavana chvíli v hloučku u začátku stezky, pak jdou lidé domů (s). */
export const CARAVAN_LINGER_S = 20;

/** Rychlost karavany – s vozy nebo dobytkem tempem volů, jinak chůzí. */
export function caravanSpeed(e: Pick<SceneExpedition, 'carts' | 'cattle'>): number {
  const herd = e.cattle;
  const animals = herd
    ? herd.out.cows + herd.out.oxen + herd.back.cows + herd.back.oxen > 0
    : false;
  return e.carts.length > 0 || animals ? CARAVAN_SPEED_M_S.oxen : CARAVAN_SPEED_M_S.walk;
}

/** Rozvrh karavany ve skutečném čase (ms) a rychlost (m/s). */
export interface CaravanTimeline {
  startMs: number;
  /** Poslední člen zástupu je za krajem mapy (u souseda na konci cesty). */
  outEndMs: number;
  /** Čelo se objeví na kraji mapy na cestě zpátky. */
  awayEndMs: number;
  /** Poslední člen došel na začátek stezky. */
  endMs: number;
  speed: number;
}

/**
 * Rozvrh karavany z okna dne, kdy cesta začala (`window`), délky stezky `trailM` a zástupů: tam
 * celá stezka a zástup tempem `caravanSpeed`, herní den u souseda (`onMap` < 1 – den za krajem
 * mapy), zpátky totéž.
 */
export function caravanTimeline(
  e: Pick<SceneExpedition, 'carts' | 'cattle' | 'onMap'>,
  window: DayWindow,
  trailM: number,
  columns: { out: number; back: number },
): CaravanTimeline {
  const speed = caravanSpeed(e);
  const startMs = window.startMs;
  const outEndMs = startMs + ((trailM + columns.out) / speed) * 1000;
  const awayMs = e.onMap < 1 ? Math.max(0, window.endMs - window.startMs) : 0;
  const awayEndMs = outEndMs + awayMs;
  const endMs = awayEndMs + ((trailM + columns.back) / speed) * 1000;
  return { startMs, outEndMs, awayEndMs, endMs, speed };
}

/** Úsek cesty karavany: tam po stezce, u souseda za krajem mapy, zpátky po stezce, doma. */
export type CaravanLeg = 'out' | 'away' | 'back' | 'done';

/** Kde je čelo karavany: úsek a vzdálenost čela od začátku stezky (m – může být mimo 0…L). */
export interface CaravanHead {
  leg: CaravanLeg;
  head: number;
  /** Rychlost čela po stezce (m/s; 0 – stojí). */
  speed: number;
}

/**
 * Čelo karavany v okamžiku `nowMs` na stezce délky `trailM` (m) – tam: čelo jde od začátku
 * stezky, až za kraj mapy dojde i poslední člen; zpátky: čelo se objeví na kraji mapy a jde
 * k začátku stezky, až tam dojde i poslední. Před odchodem stojí na začátku, po návratu chvíli
 * v hloučku (CARAVAN_LINGER_S), pak je doma (`done` – není vidět).
 */
export function caravanHead(
  t: CaravanTimeline,
  nowMs: number,
  trailM: number,
  columns: { out: number; back: number },
): CaravanHead {
  if (nowMs < t.startMs) return { leg: 'out', head: 0, speed: 0 };
  if (nowMs < t.outEndMs) {
    return { leg: 'out', head: ((nowMs - t.startMs) / 1000) * t.speed, speed: t.speed };
  }
  if (nowMs < t.awayEndMs) return { leg: 'away', head: trailM, speed: 0 };
  if (nowMs < t.endMs) {
    return { leg: 'back', head: trailM - ((nowMs - t.awayEndMs) / 1000) * t.speed, speed: t.speed };
  }
  if (nowMs < t.endMs + CARAVAN_LINGER_S * 1000) {
    return { leg: 'back', head: -columns.back, speed: 0 };
  }
  return { leg: 'done', head: 0, speed: 0 };
}

/** Kde je člen karavany na stezce: vzdálenost od začátku (m), jestli je vidět, jestli stojí. */
export interface MemberSpot {
  /** Vzdálenost od začátku stezky (m, 0…L). */
  s: number;
  visible: boolean;
  /**
   * Stojí v hloučku u začátku stezky (ještě nevyrazil / už došel) – pořadí v hloučku; jinak null.
   */
  waiting: number | null;
}

/**
 * Kde je člen `index` (v pořadí zástupu) ve vzdálenosti `behind` za čelem: tam za čelem (blíž
 * vsi), zpátky za čelem (dál od vsi). Za krajem mapy (s > L) není vidět; před odchodem a po
 * příchodu stojí v hloučku u začátku stezky.
 */
export function memberSpot(
  head: CaravanHead,
  behind: number,
  trailM: number,
  index: number,
): MemberSpot {
  if (head.leg === 'away' || head.leg === 'done')
    return { s: trailM, visible: false, waiting: null };
  const s = head.leg === 'out' ? head.head - behind : head.head + behind;
  if (s > trailM) return { s: trailM, visible: false, waiting: null };
  if (s < 0) return { s: 0, visible: true, waiting: index };
  return { s, visible: true, waiting: null };
}

/** Hlouček u začátku stezky: řady po třech za začátkem, proti směru stezky (m – vpřed, vlevo). */
export function waitingOffset(index: number): { back: number; side: number } {
  const row = Math.floor(index / 3);
  return { back: 1.6 + row * 1.5, side: ((index % 3) - 1) * 1.2 };
}
