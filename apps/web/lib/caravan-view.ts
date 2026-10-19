// Výpravy k sousedům pro karavanu ve scéně (docs/design/trade.md – Ve scéně): z výprav na cestě
// ve stavu vsi kdo jde tam a zpátky (nosiči, vozy, lidé, kteří se stěhují – pohlaví a věk z jádra)
// a postup výpravy s dnešním tempem – scéna (scene/caravan.ts) z toho rozestaví karavanu po
// zemské stezce. Čistý modul na serveru.
import {
  CARTS,
  TRADE,
  ageYears,
  newcomerProfiles,
  type TradeExpedition,
  type VillageState,
} from '@bohemia/game';
import { expeditionToday } from './manor-view';
import type { SceneExpedition } from './village-view';

/** Kdo odešel s výpravou (výprava uložená dřív nemá `members` – dospělí střídavě muž a žena). */
function leavingOf(e: TradeExpedition, day: number): SceneExpedition['leaving'] {
  const give = e.givePeople;
  if (!give) return [];
  if (give.members) {
    return give.members.map((m) => ({ sex: m.sex, age: ageYears(m.bornDay, day) }));
  }
  return Array.from({ length: give.people }, (_, i) => ({
    sex: i % 2 === 0 ? 'male' : 'female',
    age: 25,
  }));
}

/** Výpravy vsi na cestě pro scénu – karavany po zemských stezkách. */
export function sceneExpeditions(state: VillageState): SceneExpedition[] {
  const day = state.lastDay;
  return (state.trade?.expeditions ?? []).map((e) => {
    const today = expeditionToday(state, e);
    // dnešní tempo – výprava vyslaná dnes vyrazí plným tempem
    const perDay = today === null ? e.porters : today;
    const coming = newcomerProfiles(state.seed, String(e.id), e.getPeople ?? { families: [] });
    return {
      id: e.id,
      trailId: e.trailId,
      porters: e.porters,
      carts: [...(e.carts ?? [])],
      cartCrew: CARTS.tradeCrew,
      leaving: leavingOf(e, day),
      coming: coming.flatMap((p) => p.members.map((m) => ({ sex: m.sex, age: m.ageYears }))),
      carriesOut: Object.values(e.give).some((n) => (n ?? 0) > 0),
      carriesBack: Object.values(e.get).some((n) => (n ?? 0) > 0),
      progress: e.cost > 0 ? Math.min(1, Math.round((e.done / e.cost) * 1e4) / 1e4) : 1,
      rate: e.cost > 0 ? Math.round((perDay / e.cost) * 1e4) / 1e4 : 0,
      day,
      onMap: e.days > 0 ? Math.max(0.2, (e.days - TRADE.beyondEdgeDays) / e.days) : 1,
    };
  });
}
