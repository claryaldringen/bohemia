// Jak se rostliny (a kameny) krajiny mění s ročním obdobím – podle druhu, bez enginu. Shadery
// k tomu jsou v season-materials.ts, průběh roku v season-look.ts.
import { IMPOSTOR_ATLAS } from './impostor-atlas';
import type { Rgb } from './season-look';

/** Jak se rostlina (nebo kámen) mění s obdobím. */
export interface SeasonFoliageOptions {
  /** Listnáč: listí se na podzim barví a opadává, na jaře raší světlé. Bez něj jen sníh. */
  deciduous?: boolean;
  /** Barva podzimního listí (gama). */
  autumn?: Rgb;
  /** Rozptyl podzimní barvy mezi stromy 0–1 (k červenější a hnědší). */
  variation?: number;
  /** Listí, které zůstane i v zimě 0–1 (rákos stojí suchý celou zimu, mladé duby a buky drží suché listí). */
  minLeaves?: number;
  /** Sníh na plochách obrácených nahoru 0–1 (jehličí, kameny, kmeny, střechy). */
  snowTop?: number;
  /** Pás textury s kůrou (u od–do), kde nikdy není listí – topol má na kůře zelený mech. */
  barkU?: readonly [number, number];
  /** Podíl rostlin, které na jaře kvetou 0–1 (trnka a hloh mezi keři, jabloně). */
  blossom?: number;
  /** Jehličnan: sníh leží v chomáčích na větvích, ne jen na plochách obrácených nahoru. */
  needles?: boolean;
}

const OAK: SeasonFoliageOptions = { deciduous: true, autumn: [0.66, 0.47, 0.18], variation: 0.5 };
const BEECH: SeasonFoliageOptions = { deciduous: true, autumn: [0.8, 0.42, 0.12], variation: 0.35 };
const BIRCH: SeasonFoliageOptions = { deciduous: true, autumn: [0.95, 0.78, 0.22], variation: 0.2 };
const ELM: SeasonFoliageOptions = { deciduous: true, autumn: [0.9, 0.74, 0.24], variation: 0.3 };
const EVERGREEN: SeasonFoliageOptions = { snowTop: 0.75, needles: true };

/**
 * Sezónní chování podle jména modelu (stromy, keře a rostliny krajiny, nově i ovocné stromy) –
 * neznámý model se nemění. Jehličnany nechávají jehličí a v zimě na nich leží sníh.
 */
export function seasonFoliageFor(model: string): SeasonFoliageOptions | null {
  if (/^(spruce|fir|pine)/.test(model)) return EVERGREEN;
  if (/^oak/.test(model)) return OAK;
  if (/^beech/.test(model)) return BEECH;
  if (/^birch/.test(model)) return BIRCH;
  if (/^elm/.test(model)) return ELM;
  if (/^poplar/.test(model)) return { ...ELM, autumn: [0.95, 0.8, 0.26], barkU: [0, 0.3] };
  if (model === 'willow') return { ...ELM, autumn: [0.85, 0.8, 0.36], variation: 0.15 };
  if (/^apple/.test(model)) {
    return { ...OAK, autumn: [0.85, 0.6, 0.22], variation: 0.6, blossom: 1 };
  }
  // Keře: červenohnědé a oranžové, třetina na jaře kvete (trnka, hloh); trochu suchého listí
  // zůstane i v zimě (podrost z mladých buků a dubů víc).
  if (/^shrub/.test(model)) {
    return {
      deciduous: true,
      autumn: [0.74, 0.4, 0.17],
      variation: 0.5,
      minLeaves: 0.12,
      blossom: 0.35,
    };
  }
  if (model === 'underbrush-1') return { ...BEECH, minLeaves: 0.35 };
  if (model === 'underbrush-2') return { ...OAK, minLeaves: 0.35 };
  // rákos, orobinec a trsy trávy přes zimu stojí suché, lekníny zmizí
  if (model === 'reeds' || model === 'cattails' || /^grass-tuft/.test(model)) {
    return { deciduous: true, autumn: [0.7, 0.62, 0.46], variation: 0.2, minLeaves: 1 };
  }
  if (model === 'lilies') return { deciduous: true, autumn: [0.55, 0.45, 0.2], variation: 0.3 };
  if (/^(rock|boulder|stone)/.test(model)) return { snowTop: 1 };
  if (/^(fallen|snag|stump|log)/.test(model)) return { snowTop: 0.9 };
  return null;
}

/**
 * Mesh listnáčů podle jména (`trees-<model>`, `decor-<model>`, `orchard-<model>` – jabloně sadu,
 * `impostors-<buňka atlasu>`) – v zimě se vyřadí ze stínové mapy: holá koruna by jinak vrhala
 * stín plného listí.
 */
export function isDeciduousMesh(name: string): boolean {
  const impostor = /^impostors-(\d+)/.exec(name);
  const model = impostor
    ? IMPOSTOR_ATLAS.cells[Number(impostor[1])]?.model
    : /^(?:trees|decor|orchard)-(.+)$/.exec(name)?.[1];
  if (!model) return false;
  const foliage = seasonFoliageFor(model);
  return (foliage?.deciduous ?? false) && (foliage?.minLeaves ?? 0) < 1;
}
