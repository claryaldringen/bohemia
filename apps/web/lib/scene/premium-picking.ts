import {
  PREMIUM_LAND_KINDS,
  type Landscape,
  type PremiumFeatures,
  type PremiumSite,
  type PremiumSiteKind,
} from '@bohemia/game';
import { beeYard, villageCenter } from './premium-sites-layout';
import { pointInPolygon, type Point } from './village-layout';
import { distanceToPolyline, type VillageTarget } from './village-picking';

// Výběr prvku prémiové krajiny kliknutím (premium-landscapes.md – Co hráč vidí; vzor rudiště):
// jen když pod kurzorem není nic ze vsi – bod terénu uvnitř obrysu naleziště, brodu, pramene…,
// u žíly do LINE_PICK_M od osy, u ostatních do POINT_PICK_M od bodu prvku. Louky, les, svahy,
// honitba a brtě jsou plochy kolem vsi – vybírají se jen u bodu prvku (u brtí u úlů), jinak by
// klik na prázdnou zem nikdy nezrušil výběr. Řeku a stezku vybírá voda a cesta vsi.

/** Do jaké vzdálenosti od bodu prvku klik prvek vybere (m). */
export const POINT_PICK_M = 12;
/** Do jaké vzdálenosti od osy žíly (deposit) klik vybere (m). */
export const LINE_PICK_M = 8;
/** Prvky, které se kliknutím nevybírají (řeka – voda, stezka – cesta vsi). */
const UNPICKABLE: ReadonlySet<PremiumSiteKind> = new Set<PremiumSiteKind>(['river', 'route']);

type PremiumTarget = Extract<VillageTarget, { kind: 'premium-site' }>;

/** Jak daleko je bod od prvku (m); 0 = uvnitř obrysu. */
function siteDistance(l: Landscape, site: PremiumSite, x: number, z: number): number {
  const land = PREMIUM_LAND_KINDS.has(site.kind);
  if (!land && site.outline && site.outline.length > 2) {
    if (pointInPolygon(site.outline as readonly Point[], x, z)) return 0;
  }
  let d = Math.hypot(x - site.x, z - site.z);
  if (site.kind === 'bee-trees') {
    // úly stojí na okraji lesa směrem ke vsi (premium-sites-layout.ts – beeYard)
    const yard = beeYard(l, site, villageCenter(l));
    if (yard) d = Math.min(d, Math.hypot(x - yard.x, z - yard.z));
  }
  if (!land && site.line && site.line.length > 1) {
    const axis = distanceToPolyline(
      { x, z },
      site.line.map(([px, pz]) => ({ x: px, z: pz })),
    );
    if (axis <= LINE_PICK_M) d = Math.min(d, axis);
  }
  return d <= POINT_PICK_M ? d : Infinity;
}

/** Prvek prémiové krajiny pod bodem terénu `ground` (nejbližší), nebo null. */
export function pickPremiumSite(
  l: Landscape,
  features: PremiumFeatures | null,
  ground: { x: number; z: number } | null,
): PremiumTarget | null {
  if (!features || !ground) return null;
  let best: { index: number; d: number } | null = null;
  features.sites.forEach((site, index) => {
    if (UNPICKABLE.has(site.kind)) return;
    const d = siteDistance(l, site, ground.x, ground.z);
    if (d !== Infinity && (best === null || d < best.d)) best = { index, d };
  });
  if (best === null) return null;
  const { index } = best as { index: number; d: number };
  const site = features.sites[index]!;
  return { kind: 'premium-site', type: features.type, site: site.kind, index };
}
