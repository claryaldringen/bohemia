import { tileCenterWorld, type Landscape, type ObstacleLayer } from '../../landscape';
import { createRandom, deriveSeed } from '../../landscape/random';
import { CHURCH_EAST_ROTATION } from '../buildings/church-build';
import { churchDimsForCapacity, churchTypesFor } from '../buildings/church-geometry';
import { quarryNear } from '../fortification/state/stone';
import { villageQuarries } from '../fortification/state/quarry';
import { churchCoverage } from '../people/church-life';
import { canInviteLodge, canInviteMaster, inviteLodge, inviteMaster } from '../people/lodge';
import { checkChurchPlacement } from '../placement/placement-church';
import { placementVillageOf } from '../placement/placement-village';
import { CHURCH, LODGE, MASON_CRAFTS } from '../rules/rules-masonry';
import { STEWARD } from '../rules/rules-steward';
import type { ChurchDims, ChurchType, MasonryCircle, Position, VillageState } from '../types';
import { startStewardBuild, tileCell, type StewardContext } from './steward';
import { meadowTilesNearCentre, planCentre } from './steward-land';

// Kamenné zdivo NPC rodu (churches.md – Stavba: „NPC rody ano, správce zatím ne“ – Martin
// 12. 11. 2026; návrh Clauda): ves, kterou řídí NPC rod (`VillageState.nobles`), pozve huť sama,
// postaví lom a kostel malého typu okruhu. Hráčova ves ani hráčův správce nic z toho nedělají.
// Rozhoduje jen v den správce (`STEWARD.everyDays`), takže výsledek nezávisí na kouscích dopočtu;
// stavby jdou přes `startStewardBuild` (cena předem a kontrola místa jako u hráče).

/** Okruhy huti v pořadí losu (`npc-lodge`). */
const CIRCLES: readonly MasonryCircle[] = ['adriatic', 'carolingian'];

type NpcContext = Pick<StewardContext, 'day' | 'landscape' | 'obstacles'>;

/**
 * Den NPC rodu (mutuje stav): jen ves s `nobles`, s lidmi, s krajinou i vrstvou překážek a v den
 * správce. Pořadí: huť (pozvání, chybějící mistři), lom, kostel – lom a kostel nejvýš jednu stavbu.
 */
export function npcMasonryDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
): void {
  if (!state.nobles || !landscape || !obstacles || day % STEWARD.everyDays !== 0) return;
  if (state.people.length === 0) return;
  const ctx: NpcContext = { day, landscape, obstacles };
  lodgeStep(state, day);
  quarryStep(state, ctx);
  churchStep(state, ctx);
}

/**
 * Huť (stone-masonry.md – Kdo zve, NPC rod): pokřtěný rod s vojvodou (`canInviteLodge`) pozve huť,
 * až má ves `LODGE.npcMinPeople` lidí – okruh losem ze seedu vsi; huť, které chybí mistr oboru
 * (odešel, nikdo nedorostl), ho pozve znovu – všechny chybějící obory najednou.
 */
function lodgeStep(state: VillageState, day: number): void {
  if (state.lodge === undefined) {
    if (state.people.length < LODGE.npcMinPeople || canInviteLodge(state, day) !== 'ok') return;
    const draw = createRandom(deriveSeed(state.seed, 'npc-lodge')).next();
    const circle = CIRCLES[Math.min(CIRCLES.length - 1, Math.floor(draw * CIRCLES.length))]!;
    state.lodge = inviteLodge(state, circle, day).lodge;
    return;
  }
  for (const craft of MASON_CRAFTS) {
    if (canInviteMaster(state, craft) === 'ok') state.lodge = inviteMaster(state, craft, day).lodge;
  }
}

/**
 * Lom (churches.md – Stavba, NPC rod): ves s hutí bez lomu (ani rozestavěného) založí lom na
 * skalním výchozu nejblíž středu vsi (`quarryNear`). Mapa bez výchozu – kostel nebude.
 */
function quarryStep(state: VillageState, ctx: NpcContext): void {
  if (state.lodge === undefined || villageQuarries(state).length > 0) return;
  if (state.constructions.some((c) => c.kind === 'quarry')) return;
  const centre = planCentre(state);
  const outcrop = centre ? quarryNear(ctx.obstacles, centre) : null;
  if (!outcrop) return;
  startStewardBuild(state, ctx, {
    kind: 'quarry',
    position: { x: outcrop.x, z: outcrop.z, rotation: 0 },
  });
}

/**
 * Kostel (churches.md – Stavba, NPC rod): se všemi mistry ve vsi, s lomem a bez staveniště kostela
 * postaví kostel malého typu okruhu – první vždy, další při pokrytí pod `CHURCH.npc.coverageBelow`.
 * Loď na dnešní lidi × `capacityPerPerson` (`churchDimsForCapacity`), kněžištěm na východ, na louce
 * co nejblíž středu vsi (napřed místo, které nezabere pole); bez místa znovu za `retryDays`.
 */
function churchStep(state: VillageState, ctx: NpcContext): void {
  const lodge = state.lodge;
  if (lodge === undefined || villageQuarries(state).length === 0) return;
  if (lodge.npcRetryDay !== undefined && ctx.day < lodge.npcRetryDay) return;
  if (!MASON_CRAFTS.every((craft) => state.people.some((p) => p.mason === craft))) return;
  if (state.constructions.some((c) => c.kind === 'church')) return;
  const built = (state.churches ?? []).length > 0;
  if (built && churchCoverage(state).coverage >= CHURCH.npc.coverageBelow) return;
  const type = churchTypesFor(lodge.circle)[0];
  // −1e-9: 1,2 není v plovoucí čárce přesně – 40 lidí × 1,2 má být 48, ne 49
  const need = Math.ceil(state.people.length * CHURCH.npc.capacityPerPerson - 1e-9);
  const dims = churchDimsForCapacity(type, need);
  const position = churchSite(state, ctx, type, dims);
  if (position && startStewardBuild(state, ctx, { kind: 'church', type, dims, position }).ok)
    return;
  state.lodge = { ...lodge, npcRetryDay: ctx.day + CHURCH.npc.retryDays };
}

/**
 * Místo kostela: středy volných luk do `CHURCH.npc.searchTiles` od středu vsi, od nejbližšího
 * (`meadowTilesNearCentre` – jako modla a svatyně), nejvýš `checks` kontrol `checkChurchPlacement`.
 * Přednost má místo, které nezabere pole (`takenLand` prázdné); jinak první, které projde.
 */
function churchSite(
  state: VillageState,
  ctx: NpcContext,
  type: ChurchType,
  dims: ChurchDims,
): Position | null {
  const { landscape, obstacles } = ctx;
  const tiles = meadowTilesNearCentre(state, ctx.day, landscape, CHURCH.npc.searchTiles);
  const village = placementVillageOf(state, ctx.day);
  let fallback: Position | null = null;
  let checks = 0;
  for (const tile of tiles) {
    if (checks++ >= CHURCH.npc.checks) break;
    const cell = tileCell(landscape, tile);
    const c = tileCenterWorld(landscape, cell.x, cell.y);
    const position = { x: c.x, z: c.z, rotation: CHURCH_EAST_ROTATION };
    const check = checkChurchPlacement(landscape, village, type, dims, position, obstacles);
    if (!check.ok) continue;
    if (check.takenLand.length === 0) return position;
    fallback ??= position;
  }
  return fallback;
}
