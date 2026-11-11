// Pohřby pro scénu (docs/design/cemetery.md – Pohřeb ve scéně; Martin 20. 10. 2026: „Když je
// pohřeb, chtěl bych vidět průvod lidí na hřbitov a pak na hřbitově hranici.“). Jen zobrazení –
// pravidla simulace se nemění: z mohyl posledních dnů ve stavu vsi kdo zemřel (druh pohřbeného),
// kde bude ležet (místo mohyly – tam hoří hranice), odkud průvod vychází (domácnost zemřelého)
// a kdo jde za márami (lidé vsi s pohlavím a věkem). Kdy co ve scéně je, počítá scéna
// (scene/funeral-plan.ts) z okna herního dne – čistá funkce času. Čistý modul na serveru.
import {
  MOUND_SIZES,
  gravePlaceCenter,
  villageCemeteries,
  type GraveMound,
  type GraveRank,
  type MoundSize,
  type Person,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import {
  byPriority,
  fillFromOtherHomes,
  peopleByHome,
  processionPersonOf,
  type ProcessionPerson,
} from './procession';

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

/** Člověk v průvodu za márami (viz `ProcessionPerson`). */
export type SceneMourner = ProcessionPerson;

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
  const homes = peopleByHome(people);
  const own = funeral.from === undefined ? [] : (homes.get(funeral.from) ?? []);
  const out = byPriority(own, day, seed).slice(0, max);
  fillFromOtherHomes(
    out,
    homes,
    new Set(funeral.from === undefined ? [] : [funeral.from]),
    all,
    max,
    day,
    seed,
  );
  return out.map((p) => processionPersonOf(p, day));
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
