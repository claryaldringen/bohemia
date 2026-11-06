import {
  answerLevy,
  levyDialogs,
  loadVillage,
  type LevyAnswerLine,
  type LevyDialogView,
  type MacroBundle,
} from '@bohemia/game';
import { gameDeps, landscapeOfSettlement, playerToday } from './game';

// Composition root dialogů Odvody (úloha 4.4): use-casy `levyDialogs` a `answerLevy` nad
// skutečnými repozitáři. Herní logika je v `packages/game/src/application/annual-levies.ts`.

type LevyDeps = Parameters<typeof levyDialogs>[0];

/** Závislosti Odvodů: zásilky a dopočet odesílající vsi do dneška. */
function levyDeps(): LevyDeps {
  const deps = gameDeps();
  return {
    dialogs: deps.dialogs,
    vassalages: deps.vassalages,
    houses: deps.houses,
    notices: deps.notices,
    villages: deps.villages,
    shipments: {
      shipments: deps.shipments,
      villages: deps.villages,
      settlements: deps.settlements,
      locks: deps.locks,
      now: deps.now,
    },
    prepareVillage: async (villageId, today) => {
      const village = await deps.villages.find(villageId);
      const settlement = village ? await deps.settlements.find(village.settlementId) : null;
      if (!village || !settlement) return null;
      return loadVillage(
        { villages: deps.villages, pause: deps.pause },
        { villageId, today, landscape: landscapeOfSettlement(settlement) },
      );
    },
  };
}

/**
 * Otevřené dialogy Odvody hráče s předvyplněným rozdělením po vsích. Počítá se jen na vyžádání
 * (načítá stavy vsí rodu), proto není součástí dotazu na ves.
 */
export async function levyDialogsForPlayer(
  playerId: string,
): Promise<{ dialogs: LevyDialogView[] } | { error: string }> {
  return { dialogs: await levyDialogs(levyDeps(), { playerId }) };
}

/** Hráč odpoví na dialog Odvody (pošle zásilky z vsí rodu). */
export async function answerLevyForPlayer(
  playerId: string,
  input: {
    dialogId: string;
    lines: LevyAnswerLine[];
    split: Record<string, MacroBundle>;
    message: string | null;
  },
): Promise<{ ok: true; arrivesDay: number | null } | { error: string }> {
  const today = await playerToday(playerId);
  if (!today.ok) return { error: today.error };
  const result = await answerLevy(levyDeps(), { playerId, ...input, today: today.day });
  return result.ok ? { ok: true, arrivesDay: result.arrivesDay } : { error: result.reason };
}
