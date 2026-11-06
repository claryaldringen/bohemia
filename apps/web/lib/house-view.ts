// Pohled na panel „Rod a vazalové“ (docs/design/vassalage.md – Co hráč vidí): z dat use-casu
// `housePanel` složí portréty, štíty a dny pro rozhraní. Čistý modul – smí do prohlížeče. Nese jen
// veřejné údaje o cizích rodech (jména, věky, počty mužů); žádná id účtů, zásoby ani výzbroj.
import {
  formatInviteCode,
  type HousePanelData,
  type HungerLevel,
  type PanelAgreement,
  type PanelTreeNode,
  type PanelPlayerActions,
  type PersonRef,
  type PublicHouse,
} from '@bohemia/game';
import { negotiationView, type NegotiationView } from './negotiation-view';
import { personPortrait, type PersonPortraitIcon } from './person-view';
import { plural } from './village-format';

const DAY_MS = 86_400_000;

/** Muž rodu: portrét podle věku, jméno (pokud ho má) a věk – do popisku. */
export interface PortraitView {
  icon: PersonPortraitIcon;
  name: string | null;
  age: number;
  /** Popisek: „Jan, 34 let“ (a ves, ve které žije). */
  label: string;
  /** Ves muže – klik na portrét přepne na ni. */
  villageId: string;
  /** Senior rodu – stolec. */
  senior: boolean;
  /** Hráčův muž – praporec. */
  lord: boolean;
}

/** Odkaz na cizí rod: hlava rodu (portrét, jméno), počet mužů (štít) a vzdálenost. */
export interface HouseLinkView {
  houseId: string;
  icon: PersonPortraitIcon;
  lordName: string | null;
  men: number;
  distance: number;
  /** Popisek: „Boleslav – 3 muži, 12 polí daleko“. */
  label: string;
  /** Akce vůči rodu (jen v seznamu hráčů): důvody zašednutí, null = smí. */
  actions?: PlayerActionsView;
}

/** Tlačítka u cizího hráče; text je důvod, proč tlačítko nejde (null = jde). */
export interface PlayerActionsView {
  offer: string | null;
  request: string | null;
  /** Rod už je zablokovaný. */
  blocked: boolean;
}

/** Vydaná pozvánka k zobrazení. */
export interface InviteView {
  /** Kód bez pomlčky (do odkazu). */
  code: string;
  /** Kód po čtveřicích (`BH7K-M2QX`). */
  display: string;
  state: 'open' | 'used';
  /** U nevyužité: zbývající dny platnosti (aspoň 1, dokud platí). */
  daysLeft: number | null;
  /** U využité: pozvaný rod (odkaz do seznamu), nebo null. */
  invitee: HouseLinkView | null;
  /** Pozvaný se rozehrál – ikona nástupnictví. */
  played: boolean;
  /** Popisek: „Platí ještě 5 dní“ / „Pozvaný hraje“ … */
  label: string;
}

export interface HouseView {
  /** Hráč má živý rod. */
  hasHouse: boolean;
  /** Id hráčova rodu (strana podmínek jednání); prázdné bez rodu. */
  ownHouseId: string;
  own: PortraitView[];
  /** Nevyužitá nástupnictví bez losu – pečeť s počtem (0 = bez pečeti). */
  successionCredits: number;
  lords: HouseLinkView[];
  vassals: HouseLinkView[];
  others: HouseLinkView[];
  invites: InviteView[];
  freeInviteSlots: number;
  /** Otevřená jednání hráčova rodu, na tahu jsou první. */
  negotiations: NegotiationView[];
  /** Dohody hráčova rodu: podmínky, neplnění (zlomená pečeť) a id pro vypovězení. */
  agreements: PanelAgreement[];
  /** Strom vazalů pod hráčem po patrech (hloubka, pán, podmínky, hlad, štít). */
  tree: PanelTreeNode[];
  /** Hlad a štít (muži schopní služby) hráčova rodu a jeho přímých pánů a vazalů podle id rodu. */
  status: Record<string, { hunger: HungerLevel | null; shield: number }>;
  /** Čekající věci (jednání, kde je hráč na tahu) – pečeť v liště. */
  waiting: number;
}

/** Počet let k popisku („1 rok“, „2 roky“, „5 let“). */
function years(age: number): string {
  return `${age} ${plural(age, 'rok', 'roky', 'let')}`;
}

function portraitOf(
  man: {
    name: string | null;
    age: number;
    villageName: string;
    villageId: string;
    personId: number;
  },
  marks: { senior: PersonRef | null; lord: PersonRef | null },
): PortraitView {
  const icon = personPortrait({ age: man.age, sex: 'male' });
  const is = (ref: PersonRef | null): boolean =>
    ref !== null && ref.villageId === man.villageId && ref.personId === man.personId;
  const who = man.name !== null ? `${man.name}, ${years(man.age)}` : years(man.age);
  return {
    icon,
    name: man.name,
    age: man.age,
    label: `${who} – ${man.villageName}`,
    villageId: man.villageId,
    senior: is(marks.senior),
    lord: is(marks.lord),
  };
}

/** Rod jako odkaz: hlava rodu je muž se jménem `lordName`, jinak nejstarší muž. */
export function houseLinkOf(house: PublicHouse, actions?: PanelPlayerActions): HouseLinkView {
  const lord =
    house.men.find((m) => house.lordName !== null && m.name === house.lordName) ??
    [...house.men].sort((a, b) => b.age - a.age)[0] ??
    null;
  const icon = personPortrait({ age: lord?.age ?? 30, sex: 'male' });
  const men = house.men.length;
  const name = house.lordName ?? 'Rod bez jména';
  return {
    houseId: house.houseId,
    icon,
    lordName: house.lordName,
    men,
    distance: house.distance,
    label: `${name} – ${men} ${plural(men, 'muž', 'muži', 'mužů')}`,
    ...(actions
      ? {
          actions: {
            offer: actions.offer,
            request: actions.request,
            blocked: actions.blockedByMe,
          },
        }
      : {}),
  };
}

/**
 * Strom vazalů do pořadí k zobrazení: každý rod hned pod svým pánem (do hloubky), sourozenci podle
 * pořadí v datech. Uzly, jejichž pán ve stromu chybí, jdou na konec.
 */
export function orderTree(tree: readonly PanelTreeNode[], rootHouseId: string): PanelTreeNode[] {
  const out: PanelTreeNode[] = [];
  const seen = new Set<PanelTreeNode>();
  const walk = (parentId: string): void => {
    for (const node of tree) {
      if (node.parentHouseId !== parentId || seen.has(node)) continue;
      seen.add(node);
      out.push(node);
      walk(node.house.houseId);
    }
  };
  walk(rootHouseId);
  for (const node of tree) if (!seen.has(node)) out.push(node);
  return out;
}

/** Pohled na panel; `nowMs` je skutečný čas serveru (dny do konce platnosti pozvánek). */
export function houseView(data: HousePanelData, nowMs: number): HouseView {
  const negotiations = data.negotiations
    .map((n) => negotiationView(n, data.own?.houseId ?? '', houseLinkOf(n.other)))
    .sort((a, b) => Number(b.myTurn) - Number(a.myTurn));
  return {
    hasHouse: data.hasHouse,
    ownHouseId: data.own?.houseId ?? '',
    // nejstarší první (seniorát je podle věku)
    own: [...(data.own?.men ?? [])]
      .sort((a, b) => b.age - a.age)
      .map((m) =>
        portraitOf(m, { senior: data.own?.senior ?? null, lord: data.own?.lord ?? null }),
      ),
    successionCredits: data.own?.successionCredits ?? 0,
    agreements: data.agreements,
    tree: data.tree,
    status: {
      ...data.status,
      ...(data.own
        ? { [data.own.houseId]: { hunger: data.own.hunger, shield: data.own.shield } }
        : {}),
    },
    lords: data.lords.map((h) => houseLinkOf(h)),
    vassals: data.vassals.map((h) => houseLinkOf(h)),
    others: data.others.map((h) => houseLinkOf(h, data.actions[h.houseId])),
    invites: data.invites.map((invite): InviteView => {
      if (invite.state === 'open') {
        const daysLeft = Math.max(1, Math.ceil((invite.validUntil.getTime() - nowMs) / DAY_MS));
        return {
          code: invite.code,
          display: formatInviteCode(invite.code),
          state: 'open',
          daysLeft,
          invitee: null,
          played: false,
          label: `Platí ještě ${daysLeft} ${plural(daysLeft, 'den', 'dny', 'dní')}`,
        };
      }
      return {
        code: invite.code,
        display: formatInviteCode(invite.code),
        state: 'used',
        daysLeft: null,
        invitee: invite.house ? houseLinkOf(invite.house) : null,
        played: invite.played,
        label: invite.played ? 'Pozvaný se rozehrál' : 'Pozvaný přijal pozvánku',
      };
    }),
    freeInviteSlots: data.freeInviteSlots,
    negotiations,
    waiting: negotiations.filter((n) => n.myTurn).length,
  };
}
