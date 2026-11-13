import { sameCell, type GridCell } from '../village/people/world-grid';
import type { VillageState } from '../village/types';
import { armyEyes } from './alarm';
import { cellKey, gridOf, type TickContext } from './campaign-tick';
import type { CampaignState } from './campaign-types';
import type { MarchGrid, Pos } from './march-grid';
import {
  lookOnMap,
  mergeKnowledge,
  sightingsOf,
  type KnowledgeOut,
  type SeenCell,
  type SeenPart,
} from './seen';
import { inSight } from './sight';

// Znalost rodu a tažení (lord-control.md – Co vojvoda vidí: Znalost rodu, Tažení se jinak nemění;
// plán 2026-11-13 – Úloha 11 a její kolo oprav): tažení objevuje jako výjezd – na cizích mapách si
// z očí mužů zapisuje stopu a naposled viděné stavby včetně opevnění (`lookOnMap`) a rodu vůdce
// vydá, co viděli. Útočník na mapě cíle vidí i to, co rod viděl dřív („stará zpráva“). Znalost boj
// ani pohyb nečtou a pohled nečte stav žádné vsi navíc – jen vsi, které takt čte i bez něj
// (`watchVillages`, boj). Jen det-math (`domain/war/**`).

const DWELLING = 'dwelling:';

/**
 * Zapisuje bod tažení znalost map? Bod z doby před Úlohou 11 (bez rodu vůdce `houseId`) ne –
 * pokračuje bit po bitu jako dřív (zlatý otisk `alarm-types.test.ts`); objevená obydlí cíle vydá
 * i on (`discoveredSeen`, rod dohledá aplikace podle hráče).
 */
export function recordsKnowledge(s: CampaignState): boolean {
  return s.houseId !== undefined;
}

/** Id obydlí z klíče znalosti (`dwelling:12` – `sightingsOf`); jiný druh stavby – null. */
function dwellingIdOf(key: string): number | null {
  if (!key.startsWith(DWELLING)) return null;
  const id = Number(key.slice(DWELLING.length));
  return Number.isInteger(id) ? id : null;
}

/** Políčko z klíče `x,y` (`cellKey`). */
function cellOfKey(key: string): GridCell {
  const [x, y] = key.split(',');
  return { x: Number(x), y: Number(y) };
}

function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Co tažení zatím ví o mapě cíle (`CampaignState.seen`); tažení tam ještě nebylo – undefined. */
export function targetSeenOf(s: CampaignState): SeenCell | undefined {
  return s.seen?.[cellKey(s.target.cell)];
}

/**
 * Pohled po pohybu taktu – volá se až po `watchVillages`, který čte stav všech vsí na mapách se
 * skupinou s mužem na nohou, takže pohled nic nečte navíc: na každé takové cizí mapě (`armyEyes`)
 * se muži rozhlédnou z poloh skupin. Na mapě cíle při nájezdu se dívají bojující (`lookAtTarget`).
 * Takt, kterým tažení končí (fáze `done`), vsi nečte – nedívá se.
 */
export function lookOut(s: CampaignState, ctx: TickContext): void {
  if (!recordsKnowledge(s)) return;
  for (const { cell, eyes } of armyEyes(s)) {
    if (s.phase === 'raiding' && sameCell(cell, s.target.cell)) continue;
    lookOn(s, cell, eyes, ctx);
  }
}

/** Pohled bojujících mužů `eyes` na mapu cíle v taktu nájezdu – stav vsi boj už přečetl. */
export function lookAtTarget(s: CampaignState, eyes: readonly Pos[], ctx: TickContext): void {
  if (recordsKnowledge(s)) lookOn(s, s.target.cell, eyes, ctx);
}

/**
 * Pohled mužů `eyes` na mapu `cell` jako u výjezdu (`lookOnMap`, ves a mřížka jako při pohybu –
 * první ves na mapě pro den taktu, `gridOf`). Mapu nebo ves, kterou takt nemá, pohled nečte – stopa
 * se nezapíše. Shromaždiště hráč zná – tam ne. Změněná znalost je nový objekt, stará se nemění
 * (takt ji nekopíruje – sdílí ji se stavem předchozího taktu).
 */
function lookOn(s: CampaignState, cell: GridCell, eyes: readonly Pos[], ctx: TickContext): void {
  if (eyes.length === 0 || sameCell(cell, s.assembly.cell)) return;
  const map = ctx.world.landscapeOf(cell);
  if (map === null) return;
  const villageId = map.villageIds[0];
  const village = villageId === undefined ? null : ctx.world.villageAt(villageId, s.day);
  if (villageId !== undefined && village === null) return;
  const key = cellKey(cell);
  const prev = s.seen?.[key];
  const grid = gridOf(cell, s.day, ctx);
  const next = lookOnMap(prev, { villageId, village, eyes, grid, day: s.day });
  if (next !== prev) s.seen = { ...s.seen, [key]: next };
}

/**
 * Co o mapě cíle ví bod bez znalosti map (`recordsKnowledge`), když nájezd skončí: objevená obydlí
 * (`discovered`), jak stojí ve stavu cílové vsi `village` v den `s.day` (data jako u výjezdu –
 * `sightingsOf`, nikdy lidé ani zásoby). Ves, která na mapě už není (`village` null) – nic.
 */
export function discoveredSeen(s: CampaignState, village: VillageState | null): SeenCell {
  if (village === null) return { trail: [], parts: [] };
  const found = new Set(s.discovered.map((id) => `${DWELLING}${id}`));
  const parts: SeenPart[] = sightingsOf(village, s.day)
    .filter((x) => found.has(x.key))
    .map((x) => ({ key: x.key, pos: x.pos, day: s.day, data: x.data }))
    .sort(byKey);
  return { villageId: s.target.villageId, trail: [], parts };
}

/**
 * Znalost všech cizích map na konci tažení. Seřazená podle klíče políčka: pořadí klíčů záznamu se po
 * cestě přes jsonb mění, výsledek na něm nezávisí.
 */
export function seenKnowledge(s: CampaignState): KnowledgeOut[] {
  return Object.entries(s.seen ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, seen]) => ({ cell: cellOfKey(key), seen }));
}

/**
 * Co útočník ví o mapě cíle (Úloha 11): znalost rodu `known` sloučená s tím, co viděli muži tažení
 * (`mergeKnowledge` – i s pokrytím; znalost jiné vsi, než je na mapě, nese jen stopu) – mlhu ze
 * stopy odkryje prohlížeč, stavby jsou naposled viděné („stará zpráva“). Bez obydlí, která tažení
 * objevilo (pohled je nese živě – `discovered`), bez opevnění (útočník ho vidí ze stavu vsi jako
 * dřív) a bez obydlí, na jejichž místo muži tažení dohlédli (stopa, `inSight` s mřížkou `grid`)
 * a ve vsi už nejsou – `dwellings` jsou obydlí cílové vsi teď, null = nenačtená (zánik se nepozná).
 * null – rod o mapě nic neví a tažení na ní nebylo.
 */
export function knownTarget(
  s: CampaignState,
  known: SeenCell | null,
  input: { dwellings: readonly { id: number }[] | null; grid: MarchGrid | null },
): SeenCell | null {
  const own = targetSeenOf(s);
  if (known === null && own === undefined) return null;
  const merged = mergeKnowledge(
    known,
    own ?? { villageId: s.target.villageId, trail: [], parts: [] },
  );
  const found = new Set(s.discovered);
  const standing = input.dwellings && new Set(input.dwellings.map((d) => d.id));
  const eyes = (own?.trail ?? []).map(([x, z]) => ({ x, z }));
  const parts = merged.parts.filter((p) => {
    if (p.key.startsWith('fortification:')) return false;
    const id = dwellingIdOf(p.key);
    if (id === null) return true;
    if (found.has(id)) return false;
    return !standing || standing.has(id) || !eyes.some((e) => inSight(input.grid, e, p.pos));
  });
  return {
    ...(merged.villageId === undefined ? {} : { villageId: merged.villageId }),
    trail: merged.trail,
    parts,
  };
}
