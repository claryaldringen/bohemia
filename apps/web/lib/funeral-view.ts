// Pohřby pro scénu (docs/design/cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026: „Když je
// pohřeb, chtěl bych vidět průvod lidí na hřbitov a pak na hřbitově hranici.“). Jen zobrazení –
// pravidla simulace se nemění: z mohyl posledních dnů ve stavu vsi kdo zemřel (druh pohřbeného),
// kde bude ležet (místo mohyly – tam hoří hranice), odkud průvod vychází (domácnost zemřelého)
// a kdo jde za márami (lidé vsi s pohlavím a věkem). Kdy co ve scéně je, počítá scéna
// (scene/funeral-plan.ts) z okna herního dne – čistá funkce času. Čistý modul na serveru.
import {
  MOUND_SIZES,
  ageYears,
  gravePlaceCenter,
  villageCemeteries,
  type GraveMound,
  type GraveRank,
  type MoundSize,
  type Person,
  type Sex,
  type TileCell,
  type VillageState,
} from '@bohemia/game';

/**
 * Pohřby kolika posledních herních dnů jdou do scény. Průvod jde skutečnou chůzí (jako všechny
 * postavy) – k hřbitovu 200 m daleko jde ≈ 3 minuty, pak hranice hoří a herní den doutná; obřad
 * tak u vzdáleného hřbitova trvá i několik herních dnů (≈ 86 s). Scéna sama pozná, které pohřby
 * už skončily (`funeralTimeline` – mohyla se pak kreslí normálně).
 */
export const FUNERAL_VIEW_DAYS = 7;
/** Nejvýš tolik postav v průvodu (i s nosiči); za vojvodu a jeho ženu jde celá ves. */
export const MAX_FUNERAL_FIGURES = 24;
export const MAX_VOIVODE_FIGURES = 40;
/** Máry nesou čtyři muži – ve scéně vždy, nejsou mezi `mourners`. */
export const FUNERAL_BEARERS = 4;

/**
 * Člověk v průvodu za márami: pohlaví, věk (roky) a domácnost (id obydlí), kam se pak vrátí; id
 * člověka (villagers.md – Výběr postavy – postava v průvodu je on; ukázky ho nemají).
 */
export interface SceneMourner {
  id?: number;
  sex: Sex;
  age: number;
  home: number;
}

/**
 * Pohřeb ve scéně (cemetery.md – Pohřeb ve scéně): mohyla, pod kterou zemřelý bude ležet (hřbitov,
 * čtverec, první místo a velikost – podle nich scéna mohylu do dohoření hranice nekreslí), střed
 * mohyly ve světě (tam stojí hranice), druh pohřbeného, den pohřbu (= den úmrtí), domácnost
 * zemřelého (`from` – odtud vyjde průvod; mohyly uložené dřív ji nemají) a lidé za márami
 * (domácnost zemřelého a z dalších domácností 1–2 lidé, za vojvodu celá ves). Kostrový pohřeb
 * křesťana (`rite: 'inhumation'` – christianity.md – Pohřby) je bez hranice – zemřelého nesou
 * rovnou do hrobu.
 */
export interface SceneFuneral {
  /** Stálý klíč – hřbitov, čtverec a místo mohyly. */
  key: string;
  cemeteryId: number;
  cell: TileCell;
  column: number;
  row: number;
  size: MoundSize;
  rank: GraveRank;
  day: number;
  x: number;
  z: number;
  from?: number;
  rite?: GraveMound['rite'];
  mourners: SceneMourner[];
}

/** Klíč mohyly – hřbitov, čtverec a první místo (v jednom hřbitově jedinečné). */
export function funeralKey(
  cemeteryId: number,
  m: { cell: TileCell; column: number; row: number },
): string {
  return `${cemeteryId}:${m.cell.x}:${m.cell.y}:${m.column}:${m.row}`;
}

/** Deterministická náhoda 0–1 z celých čísel. */
function mix01(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mournerOf(p: Person, day: number): SceneMourner {
  return {
    id: p.id,
    // vsi uložené před příbuzenstvím pohlaví nemají – střídavě podle id
    sex: p.sex ?? (p.id % 2 === 0 ? 'female' : 'male'),
    age: ageYears(p.bornDay, day),
    home: p.dwellingId,
  };
}

/** Pořadí, v jakém jdou lidé domácnosti: dospělí, pak starší, pak děti (každá skupina podle losu). */
function byPriority(people: readonly Person[], day: number, seed: number): Person[] {
  const group = (p: Person): number => {
    const age = ageYears(p.bornDay, day);
    return age >= 14 && age < 60 ? 0 : age >= 60 ? 1 : 2;
  };
  return [...people].sort(
    (a, b) => group(a) - group(b) || mix01(seed, a.id, 5) - mix01(seed, b.id, 5) || a.id - b.id,
  );
}

/**
 * Kdo jde v průvodu za márami (cemetery.md – Pohřeb ve scéně): celá domácnost zemřelého (`from`)
 * a z každé další domácnosti jeden až dva lidé (los podle pohřbu – napřed dospělí), za vojvodu
 * a jeho ženu (`voivode`) celá ves. Nejvýš MAX_FUNERAL_FIGURES (za vojvodu MAX_VOIVODE_FIGURES)
 * postav i s nosiči; když je lidí víc, jde domácnost zemřelého a z ostatních domácností po
 * jednom, pak po druhém… (každá domácnost má v průvodu někoho, dokud to jde). Zemřelý už mezi
 * lidmi není (pohřbívá se za života – `bury`, pak `removePeople`).
 */
export function funeralMourners(
  people: readonly Person[],
  funeral: { from?: number; rank: GraveRank; day: number },
  day: number,
  seed: number,
): SceneMourner[] {
  const all = funeral.rank === 'voivode';
  const max = (all ? MAX_VOIVODE_FIGURES : MAX_FUNERAL_FIGURES) - FUNERAL_BEARERS;
  const homes = new Map<number, Person[]>();
  for (const p of people) {
    const list = homes.get(p.dwellingId);
    if (list) list.push(p);
    else homes.set(p.dwellingId, [p]);
  }
  const own = funeral.from === undefined ? [] : (homes.get(funeral.from) ?? []);
  const others = [...homes.entries()]
    .filter(([id]) => id !== funeral.from)
    .sort((a, b) => a[0] - b[0])
    .map(([id, list]) => {
      const ordered = byPriority(list, day, seed + id);
      const count = all ? ordered.length : mix01(seed, id, 3) < 0.5 ? 1 : 2;
      return ordered.slice(0, count);
    });
  const out = byPriority(own, day, seed).slice(0, max);
  // z ostatních domácností po kolech – napřed první člověk z každé, pak druzí…
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const list of others) {
      const person = list[round];
      if (!person) continue;
      added = true;
      out.push(person);
      if (out.length >= max) break;
    }
    if (!added) break;
  }
  return out.map((p) => mournerOf(p, day));
}

/**
 * Pohřby posledních FUNERAL_VIEW_DAYS herních dnů (včetně dneška `day`) pro scénu – z mohyl
 * hřbitovů vsi; mohyla ve čtverci, který se ještě ohrazuje, se nepočítá (nekreslí se).
 */
export function sceneFunerals(
  state: Pick<VillageState, 'people' | 'cemeteries'>,
  day: number,
): SceneFuneral[] {
  const out: SceneFuneral[] = [];
  for (const c of villageCemeteries(state)) {
    for (const m of c.mounds ?? []) {
      if (m.day > day || day - m.day >= FUNERAL_VIEW_DAYS) continue;
      const square = c.squares.find((q) => q.cell.x === m.cell.x && q.cell.y === m.cell.y);
      if (!square || square.constructionId !== undefined) continue;
      const { columns, rows } = MOUND_SIZES[m.size];
      const center = gravePlaceCenter(
        square,
        c.squareSizeM,
        c.grid?.rotation,
        m.column,
        m.row,
        columns,
        rows,
      );
      const seed = (c.id * 7919 + m.cell.x * 131 + m.cell.y * 977 + m.row * 7 + m.column) | 0;
      out.push({
        key: funeralKey(c.id, m),
        cemeteryId: c.id,
        cell: { x: m.cell.x, y: m.cell.y },
        column: m.column,
        row: m.row,
        size: m.size,
        rank: m.rank,
        day: m.day,
        x: Math.round(center.x * 100) / 100,
        z: Math.round(center.z * 100) / 100,
        ...(m.from !== undefined ? { from: m.from } : {}),
        ...(m.rite ? { rite: m.rite } : {}),
        mourners: funeralMourners(state.people, m, day, seed),
      });
    }
  }
  return out.sort((a, b) => a.day - b.day || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
