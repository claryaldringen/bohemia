import { villageHappiness } from '../domain/village/people/happiness';
import { sendAway } from '../domain/vassalage';
import { isAway } from '../domain/village/people/people';
import type { VillageState } from '../domain/village/types';
import { bowSkillOf, newCampaign, tickOfMs, WAR, type CampaignMember } from '../domain/war';
import { houseName } from './negotiation-chronicle';
import { startWarByAttack, type WarDeps } from './declare-war';
import { queueCampaignIntent, type CampaignRepository } from './campaigns';
import {
  homePlaces,
  prepareCampaign,
  type CampaignPlan,
  type PlanDeps,
  type PreparedCampaign,
  type PreparedVillage,
} from './plan-campaign';
import type { PassageRepository } from './passages';
import type { SeedSource } from './settlements';
import { editVillage } from './player-villages';
import type { VillageRepository } from './villages';
import type { WarRepository } from './wars';

// Vyslání tažení (war.md – Velení a příprava tažení; plán 2026-11-03 – Úloha 6.6): po ověření
// (`prepareCampaign`) muži odejdou z vsí (`away: campaign` – doma nepracují ani nejí), shromaždiště
// vydá jídlo, nařízený útok na příbuzné sníží štěstí vsi a vznikne tažení se záměrem „vyrazit“.

export interface LaunchDeps extends PlanDeps, WarDeps {
  wars: WarRepository;
  villages: VillageRepository;
  campaigns: CampaignRepository;
  /** Čekající ohlášení průchodu rodu se naváže na vyslané tažení (war.md – Pohyb). */
  passages?: Pick<PassageRepository, 'voidBetween' | 'bindToCampaign'>;
  seeds: SeedSource;
  /** Nové id tažení (uuid). */
  newId: () => string;
}

export type LaunchResult =
  { ok: true; campaignId: string; warId: string } | { ok: false; reason: string };

const CHANGED = 'Ves se mezitím změnila, zkus to znovu.';

/**
 * Hráč vyšle tažení: ověří plán (volající drží zámek hráče – web `guardedAction`, ve vsích i worker
 * jinak mění stav), přepadení bez opovědi rozpoutá válku
 * (`startWarByAttack`), pošle muže pryč, odečte jídlo a založí tažení. Selže-li uložení vsi,
 * muži a jídlo se vrátí (válka, která už začala, zůstává).
 */
export async function launchCampaign(
  deps: LaunchDeps,
  input: { playerId: string; plan: CampaignPlan; today: number; now: Date },
): Promise<LaunchResult> {
  const prepared = await prepareCampaign(deps, input);
  if (typeof prepared === 'string') return { ok: false, reason: prepared };
  const war = await startWarByAttack(deps, {
    attackerId: prepared.house.id,
    defenderId: prepared.target.house.id,
    now: input.now,
    today: input.today,
  });
  if (!war.ok) return { ok: false, reason: war.reason };
  const campaignId = deps.newId();
  const done: PreparedVillage[] = [];
  for (const village of prepared.villages) {
    const failed = await editVillage(
      deps.villages,
      village.player.village.id,
      (state) => send(state, village, campaignId, input.plan),
      CHANGED,
    );
    if (failed !== null) {
      await release(deps.villages, done, campaignId, input.plan);
      return { ok: false, reason: failed };
    }
    done.push(village);
  }
  const leaderName = await houseName(deps, prepared.house);
  const state = newCampaign(
    {
      id: campaignId,
      warId: war.warId,
      seed: deps.seeds.nextSeed(),
      tick: tickOfMs(input.now.getTime(), deps.world),
      playerId: input.playerId,
      leaderName,
      commander: input.plan.commander,
      deputy: input.plan.deputy,
      assembly: prepared.assembly,
      target: prepared.targetPlace,
      members: membersOf(prepared, input.plan, input.playerId),
      foodKg: input.plan.food,
      liveCommand: prepared.liveCommand,
      ambush: prepared.ambush,
      homes: homePlaces(prepared),
      // znalost z tažení dostane jen rod vůdce (plán 2026-11-13 – Úloha 11)
      houseId: prepared.house.id,
    },
    deps.world,
  );
  state.surrendered = input.plan.surrendered;
  try {
    await deps.campaigns.create(state, input.now);
    await deps.passages?.bindToCampaign(prepared.house.id, campaignId);
    await queueCampaignIntent(deps, {
      campaignId,
      playerId: input.playerId,
      body: { kind: 'set-out' },
      nowMs: input.now.getTime(),
    });
  } catch (error) {
    await release(deps.villages, done, campaignId, input.plan);
    throw error;
  }
  return { ok: true, campaignId, warId: war.warId };
}

/** Muži tažení: skupina podle plánu (společná, nebo na ves). */
function membersOf(
  prepared: PreparedCampaign,
  plan: CampaignPlan,
  playerId: string,
): CampaignMember[] {
  return prepared.villages.flatMap((village, index) =>
    village.men.map((m): CampaignMember => ({
      ref: { villageId: village.player.village.id, personId: m.person.id },
      playerId,
      line: m.line,
      mounted: m.mounted,
      forced: m.forced,
      ...(m.kin && m.forced ? { kin: true as const } : {}),
      strength: m.strength,
      ...(m.line ? { bowSkill: bowSkillOf(m.person) } : {}),
      health: WAR.combat.health,
      vigor: 1,
      wounded: false,
      group: plan.groups === 'by-village' ? index : 0,
      status: 'active',
    })),
  );
}

/** Rozkaz k útoku na příbuzné: kolik mužů vsi jde na rozkaz proti svým (dobrovolníci takoví nejsou). */
function orderedAgainstKin(village: PreparedVillage): number {
  return village.men.filter((m) => m.kin && (m.forced || m.line)).length;
}

/** Odchod mužů z vsi (mutuje kopii stavu); text = ves se mezitím změnila a někdo už nemůže. */
function send(
  state: VillageState,
  village: PreparedVillage,
  campaignId: string,
  plan: CampaignPlan,
): string | null {
  const day = state.lastDay;
  const ids = village.men.map((m) => m.person.id);
  for (const id of ids) {
    const person = state.people.find((p) => p.id === id);
    if (!person || isAway(person, day)) return CHANGED;
  }
  sendAway(state, day, ids, { kind: 'campaign', refId: campaignId });
  if (village.player.village.id === plan.assemblyVillageId) {
    if (plan.food > state.storesKg) return CHANGED;
    state.storesKg -= plan.food;
  }
  const kin = orderedAgainstKin(village);
  if (kin > 0) {
    const value = villageHappiness(state);
    const memory = state.happiness ?? { value, deaths: [], toil: [] };
    for (let i = 0; i < kin; i++) memory.deaths.push({ day, points: WAR.army.kinHappinessPoints });
    state.happiness = memory;
  }
  return null;
}

/** Vrátí muže a jídlo do vsí, kam už tažení sáhlo (nepovedlo se uložit další ves, nebo tažení). */
async function release(
  villages: VillageRepository,
  done: readonly PreparedVillage[],
  campaignId: string,
  plan: CampaignPlan,
): Promise<void> {
  for (const village of done) {
    const kin = orderedAgainstKin(village);
    await editVillage(
      villages,
      village.player.village.id,
      (state) => {
        for (const p of state.people) if (p.away?.refId === campaignId) delete p.away;
        if (village.player.village.id === plan.assemblyVillageId) state.storesKg += plan.food;
        if (kin > 0 && state.happiness) {
          let left = kin;
          state.happiness.deaths = state.happiness.deaths.filter((d) => {
            if (left > 0 && d.points === WAR.army.kinHappinessPoints) {
              left--;
              return false;
            }
            return true;
          });
        }
        return null;
      },
      CHANGED,
    );
  }
}
