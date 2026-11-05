import { dynastySenior, isVillageAbandoned, isVillageExtinct } from '../domain/village';
import type { HouseRepository } from './houses';
import type { VillageRecord, VillageRepository } from './villages';

// Kronika seniora rodu (seniorate.md – Seniorát): „Seniorem rodu je Bořivoj“ ve všech vsích rodu,
// kdykoli se senior změní. Senior je čistá funkce stavů vsí; v rodu (`house.senior`) je uložený
// jen naposledy hlášený, aby se změna zapsala jednou.

export interface AnnounceSeniorDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'setSenior'>;
  villages: Pick<VillageRepository, 'inbox'>;
}

/**
 * Porovná seniora rodu (`villages` = celé vsi hráče dopočítané ke dni `today`) s uloženým a při
 * změně pošle událost kroniky do každé živé vsi rodu (`ref` = `senior:<rod>:<den>:<ves>` – opakované
 * volání téhož dne nezapíše nic dalšího) a nového seniora uloží. Rod bez muže rodu nic nehlásí.
 * Volající drží zámek hráče.
 */
export async function announceSenior(
  deps: AnnounceSeniorDeps,
  input: { playerId: string; villages: readonly VillageRecord[]; today: number },
): Promise<void> {
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return;
  const living = input.villages.filter(
    (v) => !isVillageExtinct(v.state) && !isVillageAbandoned(v.state),
  );
  const senior = dynastySenior(
    living.map((v) => ({ villageId: v.id, state: v.state })),
    input.today,
  );
  if (
    !senior ||
    (house.senior?.villageId === senior.villageId && house.senior.personId === senior.personId)
  ) {
    return;
  }
  const name = living
    .find((v) => v.id === senior.villageId)
    ?.state.people.find((p) => p.id === senior.personId)?.name;
  for (const village of living) {
    await deps.villages.inbox.post({
      villageId: village.id,
      day: input.today,
      // `ref` je jedinečný v celé schránce, proto i s vsí
      ref: `senior:${house.id}:${input.today}:${village.id}`,
      body: {
        kind: 'chronicle',
        event: { day: input.today, kind: 'senior', ...(name === undefined ? {} : { name }) },
      },
    });
  }
  await deps.houses.setSenior(house.id, senior);
}
