import { sameCell, type GridCell } from '../village/people/world-grid';
import type { VillageState } from '../village/types';
import { cellKey } from './campaign-tick';
import type { CampaignState } from './campaign-types';
import type { MarchGrid, Pos } from './march-grid';
import {
  extendTrail,
  mergeKnowledge,
  sightingsOf,
  type KnowledgeOut,
  type SeenCell,
  type SeenPart,
} from './seen';
import { inSight } from './sight';

// Znalost rodu a tažení (lord-control.md – Co vojvoda vidí: Znalost rodu, Tažení se jinak nemění;
// plán 2026-11-13 – Úloha 11): tažení si cestou zapisuje stopu – místa, odkud se muži na cizích
// mapách dívali – a rodu vůdce vydá stopu a objevená obydlí cílové vsi. Útočník na mapě cíle vidí
// i to, co rod viděl dřív („stará zpráva“). Stopa je jen záznam – boj, pohyb ani výsledek nájezdu
// ji nečtou. Jen det-math (`domain/war/**`).

const DWELLING = 'dwelling:';

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

/** Stopa tažení na mapě cíle (seřazená); tažení tam ještě nebylo – []. */
export function targetTrail(s: CampaignState): readonly [number, number][] {
  return s.trail?.[cellKey(s.target.cell)] ?? [];
}

/**
 * Přidá ke stopě tažení na mapě `cell` místa mužů `eyes` (po `JOURNEY.trailStepM`, `extendTrail`).
 * Shromaždiště hráč zná – stopa tam není. Bod z doby před Úlohou 11 (bez `houseId`) stopu
 * nezapisuje – pokračuje bit po bitu jako dřív; objevená obydlí vydá i on (`targetSeen`). Změněná
 * stopa je nový objekt, stará se nemění (takt ji nekopíruje – sdílí ji se stavem předchozího taktu).
 */
export function trackTrail(s: CampaignState, cell: GridCell, eyes: readonly Pos[]): void {
  if (s.houseId === undefined || eyes.length === 0 || sameCell(cell, s.assembly.cell)) return;
  const key = cellKey(cell);
  const prev = s.trail?.[key] ?? [];
  const next = extendTrail(prev, eyes);
  if (next !== prev) s.trail = { ...s.trail, [key]: next };
}

/**
 * Co tažení ví o mapě cíle, když nájezd skončí: stopa a objevená obydlí (`discovered`), jak stojí
 * ve stavu cílové vsi `village` v den `s.day` (data jako u výjezdu – `sightingsOf`, nikdy lidé ani
 * zásoby). Ves, která na mapě už není (`village` null) – jen stopa.
 */
export function targetSeen(s: CampaignState, village: VillageState | null): SeenCell {
  const trail = [...targetTrail(s)];
  if (village === null) return { trail, parts: [] };
  const found = new Set(s.discovered.map((id) => `${DWELLING}${id}`));
  const parts: SeenPart[] = sightingsOf(village, s.day)
    .filter((x) => found.has(x.key))
    .map((x) => ({ key: x.key, pos: x.pos, day: s.day, data: x.data }))
    .sort(byKey);
  return { villageId: s.target.villageId, trail, parts };
}

/**
 * Stopy všech cizích map na konci tažení – stavby mimo cílovou ves tažení neobjevuje. Seřazené podle
 * klíče políčka: pořadí klíčů záznamu se po cestě přes jsonb mění, výsledek na něm nezávisí.
 */
export function trailKnowledge(s: CampaignState): KnowledgeOut[] {
  return Object.entries(s.trail ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, trail]) => ({ cell: cellOfKey(key), seen: { trail, parts: [] } }));
}

/**
 * Co útočník ví o mapě cíle (Úloha 11): znalost rodu `known` se stopou tažení – mlhu z ní odkryje
 * prohlížeč, stavby jsou naposled viděné („stará zpráva“); znalost jiné vsi, než je cílová, nese
 * jen stopu (`mergeKnowledge`). Bez obydlí, která tažení objevilo (pohled je nese živě –
 * `discovered`), bez opevnění (útočník ho vidí ze stavu vsi jako dřív) a bez obydlí, na jejichž
 * místo muži tažení dohlédli (stopa, `inSight` s mřížkou `grid`) a ve vsi už nejsou – `dwellings`
 * jsou obydlí cílové vsi teď, null = nenačtená (zánik se nepozná). null – rod o mapě nic neví
 * a tažení na ní nebylo.
 */
export function knownTarget(
  s: CampaignState,
  known: SeenCell | null,
  input: { dwellings: readonly { id: number }[] | null; grid: MarchGrid | null },
): SeenCell | null {
  const trail = targetTrail(s);
  if (known === null && trail.length === 0) return null;
  const merged = mergeKnowledge(known, {
    villageId: s.target.villageId,
    trail: [...trail],
    parts: [],
  });
  const found = new Set(s.discovered);
  const standing = input.dwellings && new Set(input.dwellings.map((d) => d.id));
  const eyes = trail.map(([x, z]) => ({ x, z }));
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
