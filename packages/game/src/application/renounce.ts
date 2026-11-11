import { NEGOTIATION } from '../domain/negotiation';
import { VASSALAGE } from '../domain/vassalage/rules-vassalage';
import { treeAround, type VassalEdge } from '../domain/vassalage/tree';
import type { DialogRepository } from './dialogs';
import type { HouseRepository, House } from './houses';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';
import type { NoticeRepository } from './notices';
import type { StewardshipRepository } from './stewardships';
import type { VassalageRepository } from './vassalages';

// Formální vypovězení věrnosti (vassalage.md – Konec vazalství): smí kterákoli strana, platí hned,
// upozornění dostane celý strom kolem obou stran a do kronik obou rodů se zapíše neutrální věta.

export interface RenounceDeps extends NegotiationVillages {
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  vassalages: Pick<VassalageRepository, 'byId' | 'end' | 'edgesNear'>;
  notices: Pick<NoticeRepository, 'post'>;
  /** Dialogy dohody (roční Odvody) po vypovězení zmizí. */
  dialogs?: Pick<DialogRepository, 'dropFor'>;
  /** Správa cizí vsi stojí na dohodě – s vypovězením končí (vassalage.md – Odvolání). */
  stewardships?: Pick<StewardshipRepository, 'endByVassalage'>;
}

export type RenounceResult = { ok: true } | { ok: false; reason: string };

export const NOT_IN_AGREEMENT = 'Tuhle dohodu nemáš.';
const NO_LIVE_AGREEMENT = 'Dohoda už neplatí.';
export const MESSAGE_TOO_LONG = 'Vzkaz je příliš dlouhý.';
const NO_HOUSE = 'Nemáš živý rod.';

/** Údaje o skončené dohodě pro háčky (`onVassalageEnded`). */
export interface VassalageEnded {
  vassalageId: string;
  lordHouseId: string;
  vassalHouseId: string;
  /** Proč skončila: `renounced` (vypovězení), později i vymření rodu a jiné. */
  reason: string;
  at: Date;
  day: number;
}

type EndedHook = (event: VassalageEnded) => Promise<void> | void;

const hooks: EndedHook[] = [];

/**
 * Háček po ukončení dohody: dialogy pro ni zmizí (úloha 4.4), správa vsi končí přímo v `renounceVassalage` (4.8, `stewardships`). Registr je
 * zatím prázdný; kdo ho naplní, volá `onVassalageEnded` při startu. Háčky běží po ukončení dohody,
 * jejich selhání vypovězení nevrací zpět (dohoda už neplatí).
 */
export function onVassalageEnded(hook: EndedHook): void {
  hooks.push(hook);
}

/** Jen pro testy: vyprázdní registr háčků. */
export function clearVassalageEndedHooks(): void {
  hooks.length = 0;
}

/** Spustí registrované háčky; chyba jednoho nezastaví ostatní. */
export async function runVassalageEnded(event: VassalageEnded): Promise<void> {
  for (const hook of [...hooks]) {
    try {
      await hook(event);
    } catch {
      // závazky z dohody se dočistí při dalším průchodu, vypovězení už platí
    }
  }
}

/**
 * Hráč za svůj rod vypoví dohodu `vassalageId` (jako pán i jako vazal). Platí hned: dohoda skončí
 * s důvodem `renounced`, ostatní dohody obou stran trvají. Upozornění dostane každý rod stromu
 * kolem obou stran jednou (payload jen veřejné údaje), druhá strana k tomu vzkaz.
 */
export async function renounceVassalage(
  deps: RenounceDeps,
  input: {
    playerId: string;
    vassalageId: string;
    message: string | null;
    now: Date;
    today: number;
  },
): Promise<RenounceResult> {
  const actor = await deps.houses.activeOf(input.playerId);
  if (!actor) return { ok: false, reason: NO_HOUSE };
  if (input.message !== null && input.message.length > NEGOTIATION.messageMaxChars) {
    return { ok: false, reason: MESSAGE_TOO_LONG };
  }
  const agreement = await deps.vassalages.byId(input.vassalageId);
  if (!agreement || (agreement.lordHouseId !== actor.id && agreement.vassalHouseId !== actor.id)) {
    return { ok: false, reason: NOT_IN_AGREEMENT };
  }
  if (agreement.endedAt !== null) return { ok: false, reason: NO_LIVE_AGREEMENT };
  if (!(await deps.vassalages.end(agreement.id, 'renounced', input.now))) {
    return { ok: false, reason: NO_LIVE_AGREEMENT };
  }

  const lord = await deps.houses.byId(agreement.lordHouseId);
  const vassal = await deps.houses.byId(agreement.vassalHouseId);
  const otherId =
    actor.id === agreement.lordHouseId ? agreement.vassalHouseId : agreement.lordHouseId;

  // strom kolem obou stran – po ukončení dohoda mezi nimi chybí, proto se bere z obou konců
  const edges = new Map<string, VassalEdge>();
  for (const root of [agreement.lordHouseId, agreement.vassalHouseId]) {
    for (const e of await deps.vassalages.edgesNear(root, VASSALAGE.noticeDepth)) {
      edges.set(`${e.lordHouseId}>${e.vassalHouseId}`, e);
    }
  }
  const tree = treeAround([...edges.values()], [agreement.lordHouseId, agreement.vassalHouseId]);

  const lordName = lord ? await houseName(deps, lord) : '';
  const vassalName = vassal ? await houseName(deps, vassal) : '';
  for (const houseId of tree) {
    const house: House | null = houseId === actor.id ? actor : await deps.houses.byId(houseId);
    if (!house || house.playerId === null || house.endedAt !== null) continue;
    await deps.notices.post({
      playerId: house.playerId,
      kind: 'vassalage-renounced',
      payload: {
        lordHouseId: agreement.lordHouseId,
        vassalHouseId: agreement.vassalHouseId,
        lordName,
        vassalName,
        byHouseId: actor.id,
        // vzkaz čte jen druhá strana, strom ho nevidí
        ...(houseId === otherId && input.message ? { message: input.message } : {}),
      },
      gameDay: input.today,
    });
  }

  const sides = [lord, vassal].filter((h): h is House => h !== null);
  await chronicleHouses(deps, sides, `renounce:${agreement.id}`, {
    day: input.today,
    kind: 'vassalage-renounced',
    lord: lordName,
    vassal: vassalName,
  });

  await deps.dialogs?.dropFor(agreement.id);
  await deps.stewardships?.endByVassalage(agreement.id, 'vassalage-ended', input.now);
  await runVassalageEnded({
    vassalageId: agreement.id,
    lordHouseId: agreement.lordHouseId,
    vassalHouseId: agreement.vassalHouseId,
    reason: 'renounced',
    at: input.now,
    day: input.today,
  });
  return { ok: true };
}
