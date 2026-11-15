import {
  obstacleIndex,
  obstacleKind,
  type Landscape,
  type ObstacleLayer,
} from '../../../landscape';
import { placementVillageOf } from '../../placement/placement-village';
import type { PlacementVillage } from '../../placement/placement-types';
import { OUTCROP_RADIUS_M } from '../../rules';
import { planCentre } from '../../steward/steward-land';
import type { Construction, Position, Quarry, VillageState } from '../../types';
import { quarrySiteNear, rockPointToward, villageQuarries } from './quarry';

// Převod starších lomů na plochu u skal (fortifications.md – Lom jako plocha u skal; Martin
// 15. 11. 2026: „A oprav stávající lom ve Vlkově.“). Lom z doby před plochou u skal stojí na středu
// svého výchozu bez bodu lámání (`Quarry.rock`) – hromady bloků ve scéně leží na skále. Převod
// `quarry-area` ho jednou přesune na rovnou plochu do `STONE.quarryArea.rockReachM` od okraje téhož
// výchozu podle pravidel nového lomu (`quarrySiteNear` – `checkQuarryPlacement`).

/** Rozestavěný starší lom – stavba lomu na výchozu bez bodu lámání (`Construction.quarryRock`). */
function isOldQuarrySite(c: Construction): boolean {
  return (
    c.kind === 'quarry' &&
    c.quarryOutcrop !== undefined &&
    c.position !== null &&
    c.quarryRock === undefined
  );
}

/** Potřebuje ves převod `quarry-area` – má starší lom (i rozestavěný) a převod ještě neproběhl? */
export function needsQuarryMove(state: VillageState): boolean {
  if (state.oldQuarriesMoved) return false;
  return (
    villageQuarries(state).some((q) => q.rock === undefined) ||
    state.constructions.some(isOldQuarrySite)
  );
}

/** Nové místo staršího lomu – plocha, bod lámání a výchoz nejbližší ploše (id lomu). */
interface MovedSite {
  position: Position;
  rock: { x: number; z: number };
  outcropId: number;
}

/**
 * Místo plochy pro starší lom u výchozu `outcropId` (`quarrySiteNear` – do 50 m od jeho okraje):
 * co nejblíž bodu na okraji výchozu směrem ke středu vsi (`planCentre`; ves bez středu – východní
 * okraj), tedy hned vedle skal na straně ke vsi. Napřed místo, jehož nejbližší výchoz je tenhle (lom
 * si nechá id); jinak první místo, které projde kontrolou – lom pak patří k výchozu nejbližšímu
 * ploše jako nový lom (skalní hřbet z víc výchozů). Kontrola nezná přesouvaný lom (`self`) – jinak
 * by výchoz byl zabraný. Výchoz, který vrstva nezná, nebo žádné místo – null.
 */
function siteBesideRock(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  outcropId: number,
  self: Quarry | Construction,
): MovedSite | null {
  const i = obstacleIndex(obstacles, outcropId);
  if (i < 0 || obstacleKind(obstacles, i) !== 'outcrop') return null;
  const outcrop = {
    x: obstacles.x[i]!,
    z: obstacles.z[i]!,
    radiusM: OUTCROP_RADIUS_M * obstacles.scale[i]!,
  };
  const toward = rockPointToward(outcrop, planCentre(state) ?? outcrop);
  const village: PlacementVillage = {
    ...placementVillageOf(state, state.lastDay),
    quarries: villageQuarries(state).filter((q) => q !== self),
    constructions: state.constructions.filter((c) => c !== self),
  };
  const site =
    quarrySiteNear(landscape, village, obstacles, outcrop, toward, outcropId) ??
    quarrySiteNear(landscape, village, obstacles, outcrop, toward);
  const { rock, outcrop: hit } = site?.check ?? {};
  return site && rock && hit ? { position: site.position, rock, outcropId: hit.id } : null;
}

/**
 * Převod `quarry-area` (mutuje – pusť na kopii): starší lomy (`Quarry` bez `rock`) a rozestavěné
 * starší lomy (stavba `quarry` bez `quarryRock`) se přesunou na plochu u skal (`siteBesideRock`) –
 * střed, natočení a bod lámání; den dostavění, rozpracovaná stavba, zakázky a hromady kamene
 * zůstanou. Patří-li nová plocha k jinému výchozu, dostane lom jeho id i se zakázkami
 * (`retargetQuarry`). Uložená jízda vozu s kamenem z přesunutého lomu (`stoneCart`) se zahodí –
 * spočítá se znovu od nové plochy. Bez místa (nebo výchozu ve vrstvě) lom zůstane na výchozu.
 * Značka `oldQuarriesMoved` – podruhé nic.
 */
export function withQuarriesBesideRocks(
  state: VillageState,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): void {
  for (const q of villageQuarries(state)) {
    if (q.rock !== undefined) continue;
    const site = siteBesideRock(state, landscape, obstacles, q.outcropId, q);
    if (!site) continue;
    if (site.outcropId !== q.outcropId) retargetQuarry(state, q.outcropId, site.outcropId);
    q.outcropId = site.outcropId;
    q.x = site.position.x;
    q.z = site.position.z;
    q.rotation = site.position.rotation;
    q.rock = { ...site.rock };
    forgetStoneCarts(state, q.outcropId);
  }
  for (const c of state.constructions) {
    if (!isOldQuarrySite(c)) continue;
    const site = siteBesideRock(state, landscape, obstacles, c.quarryOutcrop!, c);
    if (!site) continue;
    c.quarryOutcrop = site.outcropId;
    c.position = { ...site.position };
    c.quarryRock = { ...site.rock };
  }
  state.oldQuarriesMoved = true;
}

/**
 * Lom `from` dostal id výchozu `to` – zakázky, které z něj berou kámen, ho dostanou taky (lámání
 * do zásoby, hradba, kostel). Mutuje.
 */
function retargetQuarry(state: VillageState, from: number, to: number): void {
  for (const c of state.constructions) {
    if (c.quarryOutcrop === from) c.quarryOutcrop = to;
    if (c.fortStone?.outcropId === from) c.fortStone.outcropId = to;
    if (c.church?.quarryId === from) c.church = { ...c.church, quarryId: to };
  }
}

/** Zahodí uložené jízdy vozu s kamenem z lomu `outcropId` (kostel, hradba, zásoba). Mutuje. */
function forgetStoneCarts(state: VillageState, outcropId: number): void {
  for (const c of state.constructions) {
    if (c.stoneCart === undefined) continue;
    const from = c.church?.quarryId ?? c.fortStone?.outcropId ?? c.quarryOutcrop;
    if (from === outcropId) delete c.stoneCart;
  }
}
