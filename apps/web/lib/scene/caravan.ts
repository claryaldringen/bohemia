// Karavana výpravy k sousedovi ve scéně (docs/design/trade.md – Ve scéně; Martin 19. 10. 2026:
// „Měl bych vidět skupinu lidí, jak jde po té zemské stezce s nákladem pro sousední vesnici.
// Zpátky by se mělo vracet o dva lidi víc, když jsem si je objednal. Až bude vůz, pojedou zásoby
// na voze a ušetří se člověkodny.“). Čisté funkce bez Babylonu: kde na zemské stezce karavana je
// (jedna skupina, ne proud nosičů), kdo v ní jde tam a kdo zpátky a kde stojí každý člen.
//
// Časový rozvrh (návrh Clauda): karavana jde podle postupu výpravy v herním čase, ne skutečnou
// chůzí – cesta tam a zpět trvá dny výpravy (den ≈ 86 s), skutečná chůze 1 km by trvala čtvrt
// hodiny a výprava by se vrátila dřív, než by karavana došla na kraj mapy. Postup výpravy 0–1
// (odvedená práce ÷ cena) se v herním dni plynule posouvá dnešním tempem (u dat dne D od jeho
// začátku k postupu po dni D + 1 – karavana tak dojde domů právě, když se výprava v jádru vrátí).
// Dny cesty se dělí: na mapě tam a zpět (každé polovina dní bez dne za krajem mapy), mezi tím den
// za krajem mapy – karavana je u souseda, není vidět. Bez volných rukou (tempo 0) stojí. Rychlost
// je tak vyšší než chůze (časosběr jako jednotky v 0 A.D.), klip se přehrává rychleji.
import type { SceneExpedition } from '../village-view';

/** Rozestup lidí v karavaně (m, postavy jsou zvětšené) a vozů za sebou (m). */
export const CARAVAN_GAP_M = { person: 1.9, cart: 9 } as const;
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

/** Karavana jedním směrem: lidé, vozy (vzdálenost za čelem) a délka zástupu. */
export interface CaravanColumn {
  members: CaravanMember[];
  carts: number[];
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
 * nosiči s nákladem (`loaded`), na konci lidé, kteří se stěhují (bez nákladu).
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
  return { members, carts, length: Math.max(0, behind - CARAVAN_GAP_M.person) };
}

/**
 * Kdo v karavaně jde: tam nosiči se zbožím (s vozy jen pomocníci u vozů – náklad veze vůz)
 * a lidé, které ves dává sousedovi; zpátky tíž nosiči (s nákladem, jen když výprava něco veze)
 * a lidé od souseda, kteří s výpravou přijdou.
 */
export function caravanPlan(e: SceneExpedition): CaravanPlan {
  return {
    out: column(e, 'out', e.leaving, e.carriesOut),
    back: column(e, 'back', e.coming, e.carriesBack),
  };
}

/**
 * Postup výpravy 0–1 v okamžiku `nowMs`: postup na konci dne dat (`e.day`) a dnešní tempo
 * (`e.rate` za herní den) plynule přes herní den `window` (den dat). Bez okna stojí na postupu
 * dat.
 */
export function caravanProgress(
  e: SceneExpedition,
  window: DayWindow | null,
  nowMs: number,
): number {
  if (!window) return Math.min(1, e.progress);
  const span = Math.max(1, window.endMs - window.startMs);
  const f = Math.min(1, Math.max(0, (nowMs - window.startMs) / span));
  return Math.min(1, e.progress + e.rate * f);
}

/** Úsek cesty karavany: tam po stezce, u souseda za krajem mapy, zpátky po stezce. */
export type CaravanLeg = 'out' | 'away' | 'back';

/** Kde je čelo karavany: úsek a vzdálenost čela od začátku stezky (m – může být mimo 0…L). */
export interface CaravanHead {
  leg: CaravanLeg;
  head: number;
  /** Rychlost čela po stezce (m za herní den – scéna ji přepočte na m/s). */
  perDay: number;
}

/**
 * Čelo karavany při postupu `p` na stezce délky `trailM` (m) a se zástupem dlouhým `columnM` –
 * tam: čelo jde od začátku stezky, až za kraj mapy dojde i poslední člen; zpátky: čelo se objeví
 * na kraji mapy a jde k začátku stezky, až tam dojde i poslední. Den za krajem mapy (`e.onMap`)
 * je karavana pryč.
 */
export function caravanHead(
  e: Pick<SceneExpedition, 'onMap' | 'rate'>,
  p: number,
  trailM: number,
  columns: { out: number; back: number },
): CaravanHead {
  const half = Math.max(1e-6, e.onMap / 2);
  if (p < half) {
    const span = trailM + columns.out;
    return { leg: 'out', head: (p / half) * span, perDay: (span / half) * e.rate };
  }
  if (p < 1 - half) return { leg: 'away', head: trailM, perDay: 0 };
  const span = trailM + columns.back;
  const u = Math.min(1, (p - (1 - half)) / half);
  return { leg: 'back', head: trailM - u * span, perDay: (span / half) * e.rate };
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
  if (head.leg === 'away') return { s: trailM, visible: false, waiting: null };
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
