// Dvorec vojvody v pohledu na ves (docs/design/trade.md – Dvorec vojvody): které obydlí je
// dvorcem a vylepšení vsi, která odtud jdou – zemské stezky do 8 směrů. S okolím ves neobchoduje
// (markets.md – Pravidla 1). Čistý modul – data ze stavu vsi.
import {
  huntDenied,
  HUNT_DENIED_TEXT,
  lordFamily,
  stanceOf,
  villageManor,
  villageTrails,
  type DefenseStance,
  type TradeExpedition,
  type VillageState,
} from '@bohemia/game';
import {
  armsView,
  personPortrait,
  type DwellingResident,
  scenePersons,
  type ArmsView,
} from './person-view';
import { ROLE_NAMES } from './person-roles';
import { huntView, type HuntView } from './wildlife-view';

/**
 * Obyvatel dvorce (lord.md – Co hráč vidí): portrét, role a věk; muži rodiny od 7 let (cvičí) nesou
 * dovednosti `arms`, `horse` je u toho, kdo koně má (jezdí).
 */
export interface ManorMember extends DwellingResident {
  arms: ArmsView | null;
  horse: boolean;
}

/**
 * Proč dnes nejde vyhlásit lov (česky; hunting.md – Pravidla 2), nebo null – důvody se posuzují
 * na den honců, zítřek (`huntDenied(state, day + 1, …)` jako use-case).
 */
function huntDeniedText(state: VillageState, day: number, running: boolean): string | null {
  const denied = huntDenied(state, day + 1, running);
  return denied === null ? null : HUNT_DENIED_TEXT[denied];
}

/** Zajatec ve dvorci (war.md – Vzdaní, zajetí a výkupné): klíč zajetí a jméno do portrétu. */
export interface PrisonerView {
  id: string;
  name: string | null;
  noble: boolean;
  /** Ves, odkud zajatec pochází (war.md – výkupné); rod z ní doplní server (`houseId`). */
  homeVillageId: string;
  /** Rod zajatce (výkupné se nabízí jen zajatcům protistrany); chybí, nezná-li ho server. */
  houseId?: string;
}

/** Dvorec vojvody pro panel výběru. */
export interface VillageManor {
  /** Zajatci držení ve vsi; bez zajatců chybí. */
  prisoners?: PrisonerView[];
  /** Postoj vsi před cizím vojskem (war.md – Obránci); bez nastavení `flee`. */
  stance: DefenseStance;
  /** Lov: důvod odepření česky, nebo null (lze vyhlásit; hunting.md – Pravidla 2). */
  huntDenied: string | null;
  /** Lov rodu letos a psi dvorce (wildlife.md – Co hráč vidí); bez psů a úlovku chybí. */
  hunt?: HuntView;
  /** Obydlí (id domácnosti), které je dvorcem. */
  dwellingId: number;
  /**
   * Stojí aspoň jedna hotová zemská stezka. Stezky do 8 směrů (hotové, rozestavěné a nabídka
   * nových – cena, délka, důvod) pošle server až na vyžádání panelu (`panelOptionsOf`).
   */
  trailBuilt: boolean;
  /** Obyvatelé dvorce od nejstaršího (lord.md – Co hráč vidí). */
  family?: ManorMember[];
}

/** Obyvatelé dvorce s rolí a dovednostmi (muži rodiny od 7 let vždy, i s nulami). */
export function manorFamily(state: VillageState, day: number): ManorMember[] {
  const manor = villageManor(state);
  if (!manor) return [];
  const trainees = new Set(lordFamily(state, day).trainees.map((p) => p.id));
  return scenePersons(state, day)
    .filter((p) => p.home === manor.id)
    .map((p): ManorMember => ({
      id: p.id,
      portrait: personPortrait(p),
      role: ROLE_NAMES[p.role],
      ...(p.name !== undefined ? { name: p.name } : {}),
      age: p.age,
      arms: p.arms ?? (trainees.has(p.id) ? armsView({ bow: 0, combat: 0, riding: 0 }) : null),
      horse: p.horse === true,
    }))
    .sort((a, b) => b.age - a.age || a.id - b.id);
}

/**
 * Kolik člověkodní výprava dostala posledního dne (podíl `trade` u její stezky v rozdělení práce
 * dne); výprava vyslaná až po dni (dnes) nebo bez rozdělení práce null.
 */
export function expeditionToday(state: VillageState, e: TradeExpedition): number | null {
  const labor = state.labor;
  if (!labor || labor.day !== state.lastDay || e.startedDay >= labor.day) return null;
  return labor.shares
    .filter((s) => s.activity === 'trade' && s.target.kind === 'trail' && s.target.id === e.trailId)
    .reduce((sum, s) => sum + s.manDays, 0);
}

/** Lov a psi pro pohled na dvorec (`VillageManor.hunt`). */
function huntField(state: VillageState, day: number): { hunt?: HuntView } {
  const hunt = huntView(state, day);
  return hunt ? { hunt } : {};
}

/** Dvorec vsi pro pohled na ves; dokud stojí jen staveniště první zemnice, null. */
export function manorView(
  state: VillageState,
  day: number,
  /** Lov vsi už běží ve výpravě (`huntRunning` use-case). */
  huntRunning = false,
): VillageManor | null {
  const manor = villageManor(state);
  if (!manor || state.extinctDay !== undefined) return null;
  return {
    dwellingId: manor.id,
    ...(state.prisoners?.length
      ? {
          prisoners: state.prisoners.map((p) => ({
            id: p.id,
            name: p.name ?? null,
            noble: p.noble === true,
            homeVillageId: p.ref.villageId,
          })),
        }
      : {}),
    stance: stanceOf(state),
    huntDenied: huntDeniedText(state, day, huntRunning),
    ...huntField(state, day),
    trailBuilt: villageTrails(state).some((t) => t.builtDay !== null),
    family: manorFamily(state, day),
  };
}
