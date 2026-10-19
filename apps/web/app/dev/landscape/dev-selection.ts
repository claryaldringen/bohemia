// VÝVOJOVÝ NÁSTROJ – jen pro /dev/landscape: výběr ve vývojové vsi jako ve hře (klik na pole
// vybere díl, dvojklik celé pole – fields.md, Co hráč vidí). Vývojová ves nemá herní stav, proto
// čísla dílů a čtverců sadu pro panel výběru odhaduje odsud: úrodnost z krajiny, cesta vzdušnou
// čarou k nejbližšímu obydlí (hospodářství), letošní práce podle vzhledu dílu. Ve hře je počítá
// jádro (`buildVillageView`).
import type { Crop, Landscape, PartStage } from '@bohemia/game';
import { tileAt } from '@/lib/scene/tile-at';
import type { FieldLook, SceneVillage, VillageFieldPart, VillageView } from '@/lib/village-view';

/** Kolik práce dílu je podle vzhledu hotovo (příprava, setí, sklizeň) – jen odhad ukázky. */
function workOf(
  look: FieldLook | undefined,
  work: number | undefined,
  crop: Crop,
): VillageFieldPart['work'] {
  const share = work ?? 1;
  const crops = (prep: number, sow: number, harvest: number): VillageFieldPart['work'] => ({
    crop: { crop, prep: { task: 'plough', share: prep }, sow, harvest },
  });
  switch (look) {
    case 'plowed':
      return crops(share, 0, 0);
    case 'sown':
      return crops(1, share, 0);
    case 'sprouted':
    case 'green':
    case 'ripe':
      return crops(1, 1, 0);
    case 'harvesting':
      return crops(1, 1, share);
    case 'stubble':
      return crops(1, 1, 1);
    case 'mown':
      return { mow: share };
    case 'haystacks':
      return { mow: 1 };
    default:
      return undefined;
  }
}

const FALLOW: readonly PartStage[] = ['young-fallow', 'meadow', 'shrubs', 'young-forest'];

/**
 * Pole a sady vývojové vsi pro panel výběru – jako `VillageView` (jen to, co panel dílu, pole,
 * čtverce sadu a sadu čte; ostatní prázdné).
 */
export function devSelectionView(village: SceneVillage, l: Landscape): VillageView {
  const nearest = (x: number, z: number): { id: number; m: number } | null => {
    let best: { id: number; m: number } | null = null;
    for (const d of village.dwellings) {
      const m = Math.hypot(d.position.x - x, d.position.z - z);
      if (best === null || m < best.m) best = { id: d.id, m };
    }
    return best;
  };
  const fertilityAt = (x: number, z: number): number => {
    const tile = tileAt(l, x, z);
    return tile ? (l.fertility[tile.y * l.size + tile.x] ?? 0) : 0;
  };
  const fields = village.fields.map((field) => {
    const parts = field.parts.map((p, i): VillageFieldPart => {
      const house = nearest(p.x, p.z);
      const natural = fertilityAt(p.x, p.z);
      // osetý díl je trochu vyčerpaný – úrodnost pod přirozenou
      const fertility = p.stage === 'sown' ? Math.round(natural * 0.85) : natural;
      const work =
        p.stage === 'sown' || p.look === 'mown' || p.look === 'haystacks'
          ? workOf(p.look, p.work, p.crop ?? 'winter')
          : undefined;
      return {
        id: p.id ?? i + 1,
        fertility,
        ...(natural !== fertility ? { naturalFertility: natural } : {}),
        walkM: Math.round(house?.m ?? 0),
        ...(house ? { holding: house.id } : {}),
        ...(p.stage === 'sown' ? { sownYears: 1 } : {}),
        ...(FALLOW.includes(p.stage) ? { fallowYears: p.stage === 'young-fallow' ? 1 : 6 } : {}),
        ...(work ? { work } : {}),
        ...(p.stage === 'founding'
          ? { founding: { progress: p.work ?? 0, laborLeft: 9 * (1 - (p.work ?? 0)), trees: 2 } }
          : {}),
      };
    });
    const stages: Partial<Record<PartStage, number>> = {};
    for (const p of field.parts) stages[p.stage] = (stages[p.stage] ?? 0) + 1;
    const sown = field.parts.filter((p) => p.stage === 'sown').length;
    return {
      id: field.id,
      areaM2: field.parts.reduce((sum, p) => sum + p.size * p.size, 0),
      fertility: parts.reduce((sum, p) => sum + p.fertility, 0) / Math.max(1, parts.length),
      stages,
      surfaces: { meadow: field.parts.length },
      crops: sown > 0 ? { winter: sown } : {},
      ashParts: 0,
      ashBonus: 0,
      overgrowingM2: 0,
      parts,
    };
  });
  const orchards = (village.orchards ?? []).map((orchard) => {
    const cells = orchard.squares.map((s) => ({
      cell: s.cell,
      areaM2: s.size * s.size,
      ageYears: s.planting < 1 ? null : Math.round(s.growth * 12),
      expectedYieldKg: s.planting < 1 ? 0 : Math.round(s.growth * 60),
      planting: s.planting < 1 ? s.planting : null,
      plantingWaits: false,
      renewal: s.renewal === true,
      walkM: Math.round(nearest(s.x, s.z)?.m ?? 0),
    }));
    return {
      id: orchard.id,
      areaM2: cells.reduce((sum, c) => sum + c.areaM2, 0),
      squares: cells.length,
      cells,
      ageYears: cells[0]?.ageYears ?? null,
      expectedYieldKg: cells.reduce((sum, c) => sum + c.expectedYieldKg, 0),
      planting: null,
      plantingWaits: false,
    };
  });
  return {
    fields,
    orchards,
    constructions: [],
    households: [],
    cemeteries: [],
    pens: [],
    roads: [],
    sacred: { oaks: [], groves: [], buildings: [] },
  } as unknown as VillageView;
}
