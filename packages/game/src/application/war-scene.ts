import {
  battleForts,
  isCampaignParticipant,
  knownTarget,
  mergeKnowledge,
  sceneFolkOf,
  shownBattle,
  warSceneView,
  type BattleFort,
  type BattleSide,
  type CampaignState,
  type Pos,
  type SeenCell,
  type WarSceneBuilding,
  type WarSceneFolk,
  type WarSceneView,
} from '../domain/war';
import { cellKey } from '../domain/war/campaign-tick';
import { sameCell, type GridCell } from '../domain/village/people/world-grid';
import {
  knowledgeOfCell,
  knowledgeOfTarget,
  sightGrid,
  type KnowledgeOfTargetDeps,
  type SightGridCache,
} from './campaign-view';
import type { CampaignCells, CampaignRepository } from './campaigns';
import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Válka ve scéně vlastní mapy (war.md – Ve scéně; scene.md – Vojsko, boj a mlha války): scéna hry
// ukazuje mapu sídla hráče – tam může stát jeho vojsko (shromaždiště, návrat, průchod) a tam ho
// může napadnout cizí. Obránce tažení nevede ani v něm nemá muže, vidí ho tedy jen očima své vsi
// (domy a obránci na nohou) – stejná mlha války jako `campaignView`.

/**
 * Napadená ves v jednom herním dni: oči obránce (domy), domy pro útočníka (scéna z nich ukáže jen
 * objevené), opevnění bojiště a lidé vsi pro útěk do lesa (jen obránci – `sceneFolkOf`).
 */
export interface WarSceneDefender {
  eyes: Pos[];
  forts: BattleFort[];
  buildings: WarSceneBuilding[];
  folk: WarSceneFolk[];
}

/**
 * Mezipaměť obránce po herních dnech (klíč `ves@den`) – scéna se ptá 2× za sekundu a stav vsi
 * (u velké vsi přes 1 MB JSON) se tak čte jednou za herní den, ne při každém dotazu.
 */
export interface WarSceneDefenderCache {
  get(key: string): WarSceneDefender | undefined;
  set(key: string, defender: WarSceneDefender): void;
}

/**
 * `knowledge`, `houses` – co rod útočníka ví o mapě, kde vojsko stojí (`warSceneOnMap`, Úlohy 11
 * a 12b).
 */
export interface WarSceneDeps extends KnowledgeOfTargetDeps {
  settlements: Pick<SettlementRepository, 'find'>;
  /** `stampsOf` – id vsi sídla bez stavu; `find` – stav vsi jen při novém dni (a mřížka dohledu). */
  villages: Pick<VillageRepository, 'stampsOf' | 'find'>;
  /** `activeAlarming` – tažení, kde je ves ve varování nebo hradištěm skupiny (průvod, posel). */
  campaigns: Pick<
    CampaignRepository,
    'activeOf' | 'activeAgainst' | 'activeAlarming' | 'checkpoint'
  >;
  cells: CampaignCells;
  grids?: SightGridCache;
  defenders?: WarSceneDefenderCache;
}

/**
 * Válka na mapě sídla `settlementId`, kterou hráč vidí ve scéně: napadená ves z pohledu obránce
 * (i tažení, které ves jen varovalo – průvod uprchlíků a posel na mapě, Ú14), jinak vlastní vojsko
 * na mapě (pochod). Boj má přednost před pochodem, napadení před vlastním vojskem. null – sídlo
 * není hráče, nebo na mapě žádná válka vidět není.
 */
export async function warSceneFor(
  deps: WarSceneDeps,
  input: { playerId: string; settlementId: string },
): Promise<WarSceneView | null> {
  const settlement = await deps.settlements.find(input.settlementId);
  if (!settlement || settlement.ownerId !== input.playerId || !settlement.worldCell) return null;
  const cell: GridCell = { x: settlement.worldCell.x, y: settlement.worldCell.y };
  const [village] = await deps.villages.stampsOf([settlement.id]);
  const views: WarSceneView[] = [];
  if (village) {
    // napřed tažení proti vsi (pořadí repozitáře), pak ta, která ves jen varovala
    const ids = new Set([
      ...(await deps.campaigns.activeAgainst(village.id)),
      ...(await deps.campaigns.activeAlarming(village.id)),
    ]);
    for (const id of ids) {
      const point = await deps.campaigns.checkpoint(id);
      // vlastní vojsko proti vlastní vsi nejde – útočník je jiný hráč (nebo NPC)
      if (
        !point ||
        point.state.playerId === input.playerId ||
        !(present(point.state, cell) || alarmOn(point.state, cell))
      ) {
        continue;
      }
      const defender = await defenderOf(deps, village.id, cell, point.state.day);
      if (!defender) continue;
      const view = await viewOn(deps, point.state, cell, 'defend', defender, input.playerId);
      if (view) views.push(view);
    }
  }
  for (const id of await deps.campaigns.activeOf(input.playerId)) {
    const point = await deps.campaigns.checkpoint(id);
    if (!point || !present(point.state, cell)) continue;
    const view = await viewOn(
      deps,
      point.state,
      cell,
      'attack',
      { eyes: [], forts: [], buildings: [], folk: [] },
      input.playerId,
    );
    if (view) views.push(view);
  }
  return views.find((v) => v.battle !== null) ?? views[0] ?? null;
}

/**
 * Válka na mapě `cell` z pohledu útočníka – účastníka tažení `campaignId` (vůdce i vazal ve službě;
 * war.md – Ve scéně: mlha války na cizí mapě): celé vojsko tažení, obránci jen v dohledu jeho mužů
 * na nohou, z cílové vsi jen objevené domy a hradby, k tomu co rod hráče o mapě ví (`known`).
 * Žádné akce nad cizí vsí – jen pohled. null – hráč tažení nezná, tažení skončilo, nebo na mapě
 * vojsko nestojí (scéna se vrátí domů).
 */
export async function warSceneOnMap(
  deps: WarSceneDeps,
  input: { playerId: string; campaignId: string; cell: GridCell },
): Promise<WarSceneView | null> {
  const point = await deps.campaigns.checkpoint(input.campaignId);
  if (!point || !isCampaignParticipant(point.state, input.playerId)) return null;
  const state = point.state;
  const cell: GridCell = { x: input.cell.x, y: input.cell.y };
  if (state.phase === 'done' || state.phase === 'disbanded' || !present(state, cell)) return null;
  const onTarget = sameCell(state.target.cell, cell);
  const target = onTarget ? await defenderOf(deps, state.target.villageId, cell, state.day) : null;
  // dohled v lese jako v pohledu na tažení – mřížka mapy cíle jen při boji (i rozhodnutém dnes)
  const grid = onTarget && shownBattle(state) !== null ? await sightGrid(deps, state) : null;
  const view = warSceneView(state, {
    cell,
    side: 'attack',
    grid,
    eyes: [],
    forts: target?.forts ?? [],
    buildings: target?.buildings ?? [],
    playerId: input.playerId,
  });
  // co rod útočníka o mapě ví – stopa a stavby naposled viděné, jeden dotaz na pohled: na mapě cíle
  // sloučené s tím, co vidí tažení (Úloha 11), na mapě po cestě s tím, co tam tažení vidí teď
  if (view) {
    const known = onTarget
      ? knownTarget(state, await knowledgeOfTarget(deps, state, input.playerId), {
          dwellings: target?.buildings ?? null,
          grid,
        })
      : knownOnWay(state, await knowledgeOfCell(deps, state, input.playerId, cell), cell);
    if (known) view.known = known;
  }
  return view;
}

/**
 * Znalost rodu o mapě po cestě sloučená s tím, co tažení na té mapě vidí teď (`state.seen`, jako
 * výjezd – `seenOn`): stará zpráva platí jen mimo dohled – dům, který mezitím shořel, se v dohledu
 * vojska nekreslí a nový ano (návrh Clauda po závěrečné recenzi).
 */
function knownOnWay(state: CampaignState, known: SeenCell | null, cell: GridCell): SeenCell | null {
  const fresh = state.seen?.[cellKey(cell)] ?? null;
  if (known === null || fresh === null) return fresh ?? known;
  return mergeKnowledge(known, fresh);
}

/**
 * Je vojsko tažení na mapě – skupina na ní stojí, nebo tu běží boj (či dnes skončil – padlí leží
 * do konce dne, `shownBattle`).
 */
function present(state: CampaignState, cell: GridCell): boolean {
  const onTarget = state.target.cell.x === cell.x && state.target.cell.y === cell.y;
  return (
    state.groups.some((g) => g.cell.x === cell.x && g.cell.y === cell.y) ||
    (onTarget && shownBattle(state) !== null)
  );
}

/**
 * Je na mapě průvod uprchlíků na cestě nebo ukrytý u lesa, nebo běžící posel (Ú14)? Kdo z nich je
 * vidět (vlastní vždy, cizí v dohledu), rozhodne `warSceneView`.
 */
function alarmOn(state: CampaignState, cell: GridCell): boolean {
  const alarm = state.alarm;
  if (!alarm) return false;
  return (
    alarm.flights.some(
      (f) => sameCell(f.cell, cell) && (f.status === 'marching' || f.status === 'hidden'),
    ) || alarm.messengers.some((m) => sameCell(m.cell, cell) && m.status === 'running')
  );
}

async function viewOn(
  deps: WarSceneDeps,
  state: CampaignState,
  cell: GridCell,
  side: BattleSide,
  defender: WarSceneDefender,
  playerId: string,
): Promise<WarSceneView | null> {
  // dohled v lese jen pro obránce na mapě cíle (útočník vidí celé vlastní vojsko); z mřížky i les,
  // kam ves utekla
  const onTarget = state.target.cell.x === cell.x && state.target.cell.y === cell.y;
  const grid = side === 'defend' && onTarget ? await sightGrid(deps, state) : null;
  return warSceneView(state, {
    cell,
    side,
    grid,
    eyes: defender.eyes,
    forts: defender.forts,
    ...(side === 'defend' ? { folk: defender.folk } : {}),
    playerId,
  });
}

/** Domy a opevnění napadené vsi v den `day` – z mezipaměti, jinak jednou ze stavu vsi. */
async function defenderOf(
  deps: WarSceneDeps,
  villageId: string,
  cell: GridCell,
  day: number,
): Promise<WarSceneDefender | null> {
  const key = `${villageId}@${day}`;
  const cached = deps.defenders?.get(key);
  if (cached) return cached;
  const village = await deps.villages.find(villageId);
  if (!village) return null;
  const fortifications = village.state.fortifications ?? [];
  const defender: WarSceneDefender = {
    eyes: village.state.dwellings.map((d) => ({ x: d.position.x, z: d.position.z })),
    buildings: village.state.dwellings.map((d) => ({
      id: d.id,
      type: d.type,
      position: { x: d.position.x, z: d.position.z, rotation: d.position.rotation },
    })),
    forts:
      fortifications.length > 0
        ? battleForts((await deps.cells.mapOf(cell)).landscape, fortifications)
        : [],
    folk: sceneFolkOf(village.state, day),
  };
  deps.defenders?.set(key, defender);
  return defender;
}
