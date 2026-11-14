import type { WorldClock } from '../domain/calendar';
import { sameCell, type GridCell } from '../domain/village/people/world-grid';
import {
  CHECKPOINT_TICKS,
  commandOf,
  INTENT_LEAD_TICKS,
  journeyFinished,
  stepJourney,
  tickOfMs,
  upgradeJourney,
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
// vjede-li hlouček skupiny venku na mapu rodu, se kterým je hráčův rod ve válce, kolo za hráče
// přidá odvolání domů (`recall` – lord-control.md, Pořadí zavedení: na mapu rodu ve válce vojvoda
// nevjede). Starší kontrolní bod (jedna skupina) převede `upgradeJourney`.

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
  const from = upgradeJourney(checkpoint.state);
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
 * Změnilo se od uloženého bodu, co hráč vidí (poloha, cíl nebo dojetí hloučku, fáze výpravy
 * i skupin), nebo se v kole uplatnil jeho záměr? Hloučky a skupiny se porovnávají podle id. Web čte
 * pohled z kontrolního bodu – jedoucí hlouček se proto ukládá každé kolo (≈ 1 s), ať lidé na klik
 * reagují do vteřiny; stojící zůstávají na `CHECKPOINT_TICKS`.
 */
function playerSeesChange(
  from: JourneyState,
  to: JourneyState,
  intents: readonly JourneyIntent[],
): boolean {
  if (from.phase !== to.phase || from.groups.length !== to.groups.length) return true;
  if (from.parties.length !== to.parties.length) return true;
  if (intents.some((i) => i.tick <= to.tick)) return true;
  const phases = new Map(from.parties.map((p) => [p.id, p.phase]));
  if (to.parties.some((p) => phases.get(p.id) !== p.phase)) return true;
  const groups = new Map(from.groups.map((g) => [g.id, g]));
  return to.groups.some((g) => {
    const was = groups.get(g.id);
    if (!was || was.party !== g.party) return true;
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
 * se ptá (`atWar`) jen na políčka hloučků skupin venku (`out`), které ve spočteném stavu `after`
 * stojí na jiném políčku než ve stavu `before`, od kterého kolo počítalo (nebo tam ještě nebyly) –
 * jinak by se ptalo každou sekundu; začátek války, když hlouček už stojí, řeší
 * `recallJourneysAtWar`. Při válce zapíše za hráče odvolání `recall` toho políčka s taktem jako jeho
 * rozkaz (teď + `INTENT_LEAD_TICKS`). Jednou: skupina, která se vrací, ani políčko s čekajícím
 * odvoláním (nebo starým „Domů“ všem) se neptá.
 */
async function homeFromWar(
  deps: Pick<StepJourneysDeps, 'journeys' | 'atWar'>,
  start: JourneyState,
  after: JourneyState,
  intents: readonly JourneyIntent[],
  toTick: number,
): Promise<void> {
  if (after.phase !== 'out') return;
  const before = upgradeJourney(start);
  const out = new Set(after.parties.filter((p) => p.phase === 'out').map((p) => p.id));
  const was = new Map(before.groups.map((g) => [g.id, g.cell]));
  const cells: GridCell[] = [];
  for (const g of after.groups) {
    const prev = was.get(g.id);
    if (!out.has(g.party) || (prev && sameCell(prev, g.cell))) continue;
    if (!cells.some((c) => sameCell(c, g.cell))) cells.push(g.cell);
  }
  for (const cell of cells) {
    const pending = intents.some((i) => {
      if (i.tick <= after.tick || i.byPlayer !== after.playerId) return false;
      const command = commandOf(i.body);
      if (command.kind === 'recall') return command.cells.some((c) => sameCell(c, cell));
      return command.order.kind === 'home' && command.people === undefined;
    });
    if (pending || !(await deps.atWar(after.playerId, cell))) continue;
    await deps.journeys.addIntent(after.id, {
      tick: toTick + INTENT_LEAD_TICKS,
      byPlayer: after.playerId,
      body: { kind: 'recall', cells: [{ x: cell.x, y: cell.y }] },
    });
  }
}
