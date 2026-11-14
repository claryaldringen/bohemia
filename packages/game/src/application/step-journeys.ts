import type { WorldClock } from '../domain/calendar';
import { sameCell, type GridCell } from '../domain/village/people/world-grid';
import {
  CHECKPOINT_TICKS,
  INTENT_LEAD_TICKS,
  journeyFinished,
  stepJourney,
  tickOfMs,
  type CampaignOutbox,
  type JourneyIntent,
  type JourneyState,
} from '../domain/war';
import type { CampaignCells, CampaignLock } from './campaigns';
import type { JourneyRepository } from './journeys';
import type { KnowledgeRepository } from './knowledge';
import type { NoticeRepository } from './notices';
import {
  computeWithLoads,
  deliverOutbox,
  forgetEnded,
  memoIntentsKey,
  roundStart,
  type CampaignMemory,
  type CampaignOutcome,
} from './step-campaigns';
import type { VillageRepository } from './villages';

// Takt workeru pro výjezdy vojvody (lord-control.md; plán 2026-11-13 – Úloha 4): každý aktivní
// výjezd pod zámkem dopočte z kontrolního bodu do teď stejným cyklem jako tažení (`stepCampaigns`)
// – bod → doručit schránku → záměry → dopočet s načítáním map a vsí (`computeWithLoads`) → uložit
// → doručit. Restart workeru pokračuje z bodu se stejným výsledkem; návrat do vsi (`away-ends`)
// i upozornění se po pádu mezi uložením a doručením doručí z bodu v dalším kole. Navíc válka:
// vjede-li skupina venku na mapu rodu, se kterým je hráčův rod ve válce, kolo za hráče přidá rozkaz
// „Domů“ (lord-control.md – Pořadí zavedení: na mapu rodu ve válce vojvoda nevjede).

export interface StepJourneysDeps {
  journeys: JourneyRepository;
  campaignLock: CampaignLock;
  cells: CampaignCells;
  /** Vsi výjezdu – s pamětí workeru se celý stav načte jen u vsí, jejichž otisk se změnil. */
  villages: Pick<VillageRepository, 'find' | 'stampsOfVillages' | 'archivedOf' | 'inbox'>;
  notices: Pick<NoticeRepository, 'post'>;
  /** Znalost rodu – co muži viděli, se z bodu schránkou sloučí do úložiště. */
  knowledge: Pick<KnowledgeRepository, 'merge'>;
  world: WorldClock;
  /** Je rod hráče ve válce s rodem, kterému patří ves na políčku? */
  atWar(playerId: string, cell: GridCell): Promise<boolean>;
  /**
   * Paměť workeru napříč koly – vlastní instance (`newCampaignMemory<JourneyState>()`), ne paměť
   * tažení: konec kola zapomene, co mezi aktivními výjezdy není. Jen zrychlení – výsledek je tentýž.
   */
  memory?: CampaignMemory<JourneyState>;
}

/** Jak dopadl jeden výjezd v kole – tvar `CampaignResult` (id a výsledek kola). */
export interface JourneyResult {
  journeyId: string;
  outcome: CampaignOutcome;
  error?: unknown;
}

/**
 * Jedno kolo smyčky výjezdů: všechny aktivní výjezdy (běžící, nebo s nedoručenými událostmi) do
 * taktu `tickOfMs(nowMs)`. Chyba jednoho výjezdu ostatní nezastaví (`failed` ve výsledku).
 */
export async function stepJourneys(
  deps: StepJourneysDeps,
  input: { nowMs: number },
): Promise<JourneyResult[]> {
  const toTick = tickOfMs(input.nowMs, deps.world);
  const results: JourneyResult[] = [];
  const active = await deps.journeys.active();
  for (const journeyId of active) {
    try {
      const held = await deps.campaignLock.tryRun(journeyId, () =>
        stepOne(deps, journeyId, toTick),
      );
      results.push({ journeyId, outcome: held.ran ? held.value : 'busy' });
    } catch (error) {
      results.push({ journeyId, outcome: 'failed', error });
    }
  }
  if (deps.memory) forgetEnded(deps.memory, active);
  return results;
}

async function stepOne(
  deps: StepJourneysDeps,
  journeyId: string,
  toTick: number,
): Promise<CampaignOutcome> {
  const checkpoint = await deps.journeys.checkpoint(journeyId);
  if (!checkpoint) return 'idle';
  const from = checkpoint.state;
  // pád mezi uložením bodu a doručením – události bodu se doručí teď (`ref` podruhé zahozen)
  if (checkpoint.outbox) {
    await deliverOutbox(deps, checkpoint.outbox);
    await deps.journeys.clearOutbox(journeyId, from.tick);
  }
  if (journeyFinished(from) || toTick <= from.tick) return 'idle';

  const intents = await deps.journeys.intentsAfter(journeyId, from.tick);
  // paměť workeru: pokračovat od posledního spočteného stavu (bez událostí – jinak by se uložil)
  const states = deps.memory?.states;
  const start = roundStart(states?.get(journeyId), checkpoint, intents, toTick);
  states?.delete(journeyId);
  const step = await computeWithLoads(deps, start, (state, world) =>
    stepJourney(state, toTick, intents, world),
  );
  if (step.state.tick === from.tick) return 'waiting';
  await homeFromWar(deps, start, step.state, intents, toTick);

  const knowledge = (step.knowledge ?? []).map((k) => ({ houseId: step.state.houseId, ...k }));
  const outbox: CampaignOutbox | null =
    step.villageEvents.length > 0 || step.notices.length > 0 || knowledge.length > 0
      ? {
          villageEvents: step.villageEvents,
          notices: step.notices,
          ...(knowledge.length > 0 ? { knowledge } : {}),
        }
      : null;
  // výjezd čeká na ves (bariéra Ú6.7) – bod se uloží hned, ať mez vsi povyroste (jako u tažení)
  const due =
    outbox !== null ||
    journeyFinished(step.state) ||
    (step.waiting?.villageIds.length ?? 0) > 0 ||
    playerSeesChange(from, step.state, intents) ||
    step.state.tick - from.tick >= CHECKPOINT_TICKS;
  if (!due) {
    states?.set(journeyId, {
      checkpoint: checkpoint.version,
      intents: memoIntentsKey(intents, step.state.tick),
      state: step.state,
    });
    return step.waiting ? 'waiting' : 'computed';
  }

  const saved = await deps.journeys.saveCheckpoint(journeyId, {
    fromTick: from.tick,
    seenIntents: intents.filter((i) => i.tick <= step.state.tick).length,
    state: step.state,
    outbox,
  });
  if (saved === 'stale') return 'stale';
  if (outbox) {
    await deliverOutbox(deps, outbox);
    await deps.journeys.clearOutbox(journeyId, step.state.tick);
  }
  return 'saved';
}

/**
 * Změnilo se od uloženého bodu, co hráč vidí (poloha, cíl nebo dojetí skupiny, fáze), nebo se v kole
 * uplatnil jeho záměr? Web čte pohled z kontrolního bodu – jedoucí skupina se proto ukládá každé
 * kolo (≈ 1 s), ať vojvoda na klik reaguje do vteřiny; stojící skupina zůstává na `CHECKPOINT_TICKS`.
 */
function playerSeesChange(
  from: JourneyState,
  to: JourneyState,
  intents: readonly JourneyIntent[],
): boolean {
  if (from.phase !== to.phase || from.groups.length !== to.groups.length) return true;
  if (intents.some((i) => i.tick <= to.tick)) return true;
  return to.groups.some((g, n) => {
    const was = from.groups[n]!;
    return (
      was.cell.x !== g.cell.x ||
      was.cell.y !== g.cell.y ||
      was.pos.x !== g.pos.x ||
      was.pos.z !== g.pos.z ||
      was.arrived !== g.arrived ||
      was.goal?.cell.x !== g.goal?.cell.x ||
      was.goal?.cell.y !== g.goal?.cell.y ||
      was.goal?.pos.x !== g.goal?.pos.x ||
      was.goal?.pos.z !== g.goal?.pos.z
    );
  });
}

/**
 * Vjezd na mapu rodu ve válce (lord-control.md – Pořadí zavedení; plán 2026-11-13 – Úloha 4): kolo
 * se ptá (`atWar`) jen tehdy, když skupina ve spočteném stavu `after` stojí na jiném políčku než ve
 * stavu `before`, od kterého kolo počítalo – jinak by se ptalo každou sekundu; začátek války, když
 * skupina už stojí, řeší `recallJourneysAtWar`. Při válce zapíše za hráče rozkaz „Domů“ s taktem
 * jako jeho rozkaz (teď + `INTENT_LEAD_TICKS`). Jednou: výjezd, který se vrací, ani výjezd
 * s čekajícím „Domů“ hráče se neptá.
 */
async function homeFromWar(
  deps: Pick<StepJourneysDeps, 'journeys' | 'atWar'>,
  before: JourneyState,
  after: JourneyState,
  intents: readonly JourneyIntent[],
  toTick: number,
): Promise<void> {
  const [was, group] = [before.groups[0], after.groups[0]];
  if (after.phase !== 'out' || !group || (was && sameCell(was.cell, group.cell))) return;
  const pending = intents.some(
    (i) => i.body.kind === 'home' && i.tick > after.tick && i.byPlayer === after.playerId,
  );
  if (pending || !(await deps.atWar(after.playerId, group.cell))) return;
  await deps.journeys.addIntent(after.id, {
    tick: toTick + INTENT_LEAD_TICKS,
    byPlayer: after.playerId,
    body: { kind: 'home' },
  });
}
