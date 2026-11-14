import type { WorldClock } from '../domain/calendar';
import {
  campaignFinished,
  INTENT_LEAD_TICKS,
  tickOfMs,
  type AlarmVillage,
  type CampaignIntent,
  type CampaignState,
} from '../domain/war';
import { presenceWanted } from '../domain/war/alarm-steward';
import type { CampaignRepository } from './campaigns';
import type { PresenceRepository } from './presence';

// Odpověď workeru na přítomnost obránce (war.md – Hráč ve vsi a mimo ni; plán 2026-11-14 –
// Rozhodnutí plánu 2, Úloha 6). Tažení se přítomnosti hráče neptá v taktu (odpověď by závisela na
// tom, kdy worker takt počítá) – varovaná ves s vojvodou doma zapíše dotaz (`askedTick`) a worker
// po výpočtu kola odpoví záměrem `alarm-presence` na takt `state.tick + INTENT_LEAD_TICKS` od
// vlastníka vsi. Záměr hodnotu zmrazí a projde stejnou pojistkou jako rozkazy (`saveCheckpoint` ×
// `addIntent`); paměť kola (`memoIntentsKey`) bere jen záměry do `state.tick`, takže ji neruší.

/**
 * Záměry `alarm-presence` pro vsi, které se ptají nebo potřebují obnovit přítomnost
 * (`presenceWanted`); vrátí počet zapsaných. `seenTick` = poslední přítomnost vlastníka
 * (`PresenceRepository.lastSeen` – jeden dotaz pro všechny vlastníky) oříznutá na takt záměru
 * (Review Focus 1: worker pozadu za skutečným časem – přítomnost „z budoucnosti“ tažení platí od
 * taktu záměru); bez záznamu nebo bez portu null. Obnova jen s novější přítomností, než ves zná.
 * Čeká-li už záměr `alarm-presence` té vsi za `state.tick`, další se nepíše. Skončené tažení nic.
 */
export async function answerPresence(
  deps: {
    campaigns: Pick<CampaignRepository, 'addIntent'>;
    presence?: Pick<PresenceRepository, 'lastSeen'>;
    world: WorldClock;
  },
  input: { campaignId: string; state: CampaignState; intents: readonly CampaignIntent[] },
): Promise<number> {
  const { state } = input;
  if (campaignFinished(state)) return 0;
  const wanted = (state.alarm?.villages ?? []).flatMap((v) => {
    const want = presenceWanted(state, v);
    const playerId = v.owner.playerId;
    if (want === null || playerId === null || awaited(input.intents, state.tick, v, playerId)) {
      return [];
    }
    return [{ v, want, playerId }];
  });
  if (wanted.length === 0) return 0;

  const owners = [...new Set(wanted.map((w) => w.playerId))].sort();
  const seen = deps.presence ? await deps.presence.lastSeen(owners) : new Map<string, number>();
  const tick = state.tick + INTENT_LEAD_TICKS;
  let written = 0;
  for (const { v, want, playerId } of wanted) {
    const ms = seen.get(playerId);
    const seenTick = ms === undefined ? null : Math.min(tickOfMs(ms, deps.world), tick);
    // obnova jen s novější přítomností – stejná nebo starší by nic nezměnila
    const known = want === 'refresh' ? v.presenceTick : undefined;
    if (typeof known === 'number' && (seenTick === null || seenTick <= known)) continue;
    const added = await deps.campaigns.addIntent(input.campaignId, {
      tick,
      byPlayer: playerId,
      body: { kind: 'alarm-presence', village: v.villageId, seenTick },
    });
    if (added) written++;
  }
  return written;
}

/** Čeká na ves už odpověď – záměr `alarm-presence` vlastníka s taktem za `after`? */
function awaited(
  intents: readonly CampaignIntent[],
  after: number,
  v: AlarmVillage,
  playerId: string,
): boolean {
  return intents.some(
    (i) =>
      i.tick > after &&
      i.byPlayer === playerId &&
      i.body.kind === 'alarm-presence' &&
      i.body.village === v.villageId,
  );
}
