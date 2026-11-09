import type { WorldClock } from '../domain/calendar';
import { battleForts, breakoutChoice, type BattleFort, type BreakoutBlock } from '../domain/war';
import { queueCampaignIntent, type CampaignCells, type CampaignRepository } from './campaigns';
import { requireRight, type RightsDeps } from './rights';

// Rozkaz „Probít se“ obráncům napadené vsi (fortifications.md – Obrana bez násobku 3, Bod zlomu
// a probíjení; war.md – Kryt pod palbou, bod zlomu za hradbou a probíjení): přítomný držitel vsi
// (právo `war`) rozkáže obráncům za hradbou, aby se pohromadě probili branou do lesa. Záměr
// `breakout` jde do cizího tažení proti vsi na takt teď + 2 – stav vsi se nemění, proto bez zámku
// vsi (rozkaz v boji nesmí čekat na dopočet vsi; návrh Clauda).

/** Proč rozkaz nejde – důvod u tlačítka i odpověď use-casu (jediné místo textů). */
export const BREAKOUT_BLOCKED: Readonly<Record<BreakoutBlock, string>> = {
  over: 'Boj neběží.',
  undefended: 'Nikdo nebrání hradbu.',
  routed: 'Obránci utíkají.',
  underway: 'Obránci se už probíjejí.',
};

/** U vsi se nebojuje (žádné tažení s bojem proti ní) – jako boj, který neběží. */
export const BREAKOUT_NO_BATTLE = BREAKOUT_BLOCKED.over;
/** Ves nemá opevnění s branou – není kudy se probít. */
export const BREAKOUT_NO_GATE = 'Opevnění nemá bránu.';

export interface OrderBreakoutDeps extends RightsDeps {
  campaigns: Pick<CampaignRepository, 'activeAgainst' | 'checkpoint' | 'addIntent'>;
  /** Mapa sídla – opevnění bojiště (`battleForts`) jako v boji. */
  cells: CampaignCells;
  world: WorldClock;
}

export interface OrderBreakoutInput {
  playerId: string;
  villageId: string;
  /** Dnešní herní den hráče – práva ve vsi rodu (`requireRight`). */
  today: number;
  /** Skutečný čas rozkazu – takt záměru (`queueCampaignIntent`). */
  nowMs: number;
}

export type OrderBreakoutResult = { ok: true; campaignId: string } | { ok: false; reason: string };

/**
 * Zapíše záměr `breakout` do boje u vsi `villageId`: ověří právo `war` (správce cizí vsi ho nemá),
 * najde cizí tažení s bojem u vsi a opevnění, jehož obránci se probijí (`breakoutChoice` – s branou,
 * před bodem zlomu, s obránci na nohou, ještě bez probíjení). Bránu vybere takt (`breakoutGate` –
 * nejméně útočníků, i hlídanou). Jinak důvod česky.
 */
export async function orderBreakout(
  deps: OrderBreakoutDeps,
  input: OrderBreakoutInput,
): Promise<OrderBreakoutResult> {
  const found = await requireRight(deps, {
    playerId: input.playerId,
    villageId: input.villageId,
    right: 'war',
    today: input.today,
  });
  if (typeof found === 'string') return { ok: false, reason: found };
  const cell = found.settlement.worldCell;
  const fortifications = found.village.state.fortifications ?? [];
  if (!cell) return { ok: false, reason: BREAKOUT_NO_BATTLE };
  let forts: BattleFort[] | null = null;
  let reason = BREAKOUT_NO_BATTLE;
  for (const id of await deps.campaigns.activeAgainst(found.village.id)) {
    const point = await deps.campaigns.checkpoint(id);
    const s = point?.state;
    // vlastní vojsko proti vlastní vsi nejde; boj jen u vsi na mapě sídla
    if (!s || s.playerId === input.playerId || s.target.villageId !== found.village.id) continue;
    if (s.target.cell.x !== cell.x || s.target.cell.y !== cell.y) continue;
    if (s.phase !== 'raiding' || !s.battle) continue;
    forts ??=
      fortifications.length > 0
        ? battleForts((await deps.cells.mapOf({ x: cell.x, y: cell.y })).landscape, fortifications)
        : [];
    const choice = breakoutChoice(s.battle, forts);
    if (choice === null) {
      reason = BREAKOUT_NO_GATE;
      continue;
    }
    if ('blocked' in choice) {
      reason = BREAKOUT_BLOCKED[choice.blocked];
      continue;
    }
    const queued = await queueCampaignIntent(deps, {
      campaignId: id,
      playerId: input.playerId,
      body: { kind: 'breakout', fort: choice.fort },
      nowMs: input.nowMs,
    });
    if (queued) return { ok: true, campaignId: id };
    reason = BREAKOUT_BLOCKED.over;
  }
  return { ok: false, reason };
}
