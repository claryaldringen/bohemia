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
  type JourneyHunt,
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
 * i skupin, lov – `huntSeesChange`), nebo se v kole uplatnil jeho záměr? Hloučky a skupiny se
 * porovnávají podle id. Web čte pohled z kontrolního bodu – jedoucí hlouček i utíkající zvíře se
 * proto ukládají každé kolo (≈ 1 s), ať lidé na klik reagují do vteřiny; stojící zůstávají na
 * `CHECKPOINT_TICKS`.
 */
export function playerSeesChange(
  from: JourneyState,
  to: JourneyState,
  intents: readonly JourneyIntent[],
): boolean {
  if (from.phase !== to.phase || from.groups.length !== to.groups.length) return true;
  if (from.parties.length !== to.parties.length) return true;
  if (intents.some((i) => i.tick <= to.tick)) return true;
  if (huntSeesChange(from.hunt, to.hunt)) return true;
  const parties = new Map(from.parties.map((p) => [p.id, p]));
  if (
    to.parties.some((p) => {
      const was = parties.get(p.id);
      return (
        was?.phase !== p.phase ||
        was.arrivedTick !== p.arrivedTick ||
        was.hunting !== p.hunting ||
        JSON.stringify(was.horseWork) !== JSON.stringify(p.horseWork)
      );
    })
  ) {
    return true;
  }
  // kůň pod jezdcem (nasedl, sesedl, vede ho) – scéna ukazuje jezdce a koně
  if (from.members.length !== to.members.length) return true;
  if (
    to.members.some((m, i) => {
      const was = from.members[i]!;
      return was.mounted !== m.mounted || was.horse !== m.horse || was.group !== m.group;
    })
  ) {
    return true;
  }
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
 * Změnil se lov tak, že to hráč vidí (plán 2026-11-22-hunting – Úloha 9)? Lov začal nebo zmizel,
 * poloha, stav a rány zvířete, konec souboje, odnos (`beaters.end`), stav a rány útočníků. Cesta
 * honců je funkce taktu (`beatersAt`) – kvůli ní se bod neukládá.
 */
function huntSeesChange(from: JourneyHunt | undefined, to: JourneyHunt | undefined): boolean {
  if (from === undefined || to === undefined) return from !== to;
  if (from.id !== to.id) return true;
  const [a, b] = [from.fight, to.fight];
  if (a.outcome !== b.outcome || a.hunters.length !== b.hunters.length) return true;
  const [qa, qb] = [a.quarry, b.quarry];
  if (qa.state !== qb.state || qa.hits !== qb.hits) return true;
  if (qa.pos.x !== qb.pos.x || qa.pos.z !== qb.pos.z) return true;
  if (JSON.stringify(from.beaters.end) !== JSON.stringify(to.beaters.end)) return true;
  return b.hunters.some((h, i) => {
    const was = a.hunters[i]!;
    return was.personId !== h.personId || was.state !== h.state || was.hits !== h.hits;
  });
}

/**
 * Vjezd na mapu rodu ve válce (lord-control.md – Pořadí zavedení; plán 2026-11-14 – Úloha 6): kolo
 * se ptá (`atWar`) jen na políčka hloučků skupin venku (`out`), které ve spočteném stavu `after`
 * stojí na jiném políčku než ve stavu `before`, od kterého kolo počítalo; nový hlouček (dělení
 * skupiny) se porovnává s domovským políčkem – jinak by se ptalo každou sekundu. Začátek války,
 * když hlouček už stojí, řeší `recallJourneysAtWar`. Políčka ve válce jdou v jednom záměru
 * `recall` s taktem jako rozkaz hráče (teď + `INTENT_LEAD_TICKS`). Políčko s čekajícím odvoláním
 * (nebo starým „Domů“ všem) se neptá, skupina, která se vrací, také ne.
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
    if (!out.has(g.party) || sameCell(was.get(g.id) ?? before.home.cell, g.cell)) continue;
    if (!cells.some((c) => sameCell(c, g.cell))) cells.push(g.cell);
  }
  const pending = intents.filter((i) => i.tick > after.tick && i.byPlayer === after.playerId);
  const waiting = (cell: GridCell): boolean =>
    pending.some((i) => {
      const command = commandOf(i.body);
      if (command.kind === 'recall') return command.cells.some((c) => sameCell(c, cell));
      return (
        command.kind === 'order' && command.order.kind === 'home' && command.people === undefined
      );
    });
  const war: GridCell[] = [];
  for (const cell of cells) {
    if (waiting(cell) || !(await deps.atWar(after.playerId, cell))) continue;
    war.push({ x: cell.x, y: cell.y });
  }
  if (war.length === 0) return;
  await deps.journeys.addIntent(after.id, {
    tick: toTick + INTENT_LEAD_TICKS,
    byPlayer: after.playerId,
    body: { kind: 'recall', cells: war },
  });
}
