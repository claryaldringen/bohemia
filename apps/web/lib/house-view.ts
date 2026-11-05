// Pohled na panel „Rod a vazalové“ (docs/design/vassalage.md – Co hráč vidí): z dat use-casu
// `housePanel` složí portréty, štíty a dny pro rozhraní. Čistý modul – smí do prohlížeče. Nese jen
// veřejné údaje o cizích rodech (jména, věky, počty mužů); žádná id účtů, zásoby ani výzbroj.
import {
  formatInviteCode,
  type HousePanelData,
  type PersonRef,
  type PublicHouse,
} from '@bohemia/game';
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
  own: PortraitView[];
  /** Nevyužitá nástupnictví bez losu – pečeť s počtem (0 = bez pečeti). */
  successionCredits: number;
  lords: HouseLinkView[];
  vassals: HouseLinkView[];
  others: HouseLinkView[];
  invites: InviteView[];
  freeInviteSlots: number;
  /** Čekající věci (jednání, dialogy) – pečeť v liště; první verze vždy 0. */
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
export function houseLinkOf(house: PublicHouse): HouseLinkView {
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
  };
}

/** Pohled na panel; `nowMs` je skutečný čas serveru (dny do konce platnosti pozvánek). */
export function houseView(data: HousePanelData, nowMs: number): HouseView {
  return {
    hasHouse: data.hasHouse,
    // nejstarší první (seniorát je podle věku)
    own: [...(data.own?.men ?? [])]
      .sort((a, b) => b.age - a.age)
      .map((m) =>
        portraitOf(m, { senior: data.own?.senior ?? null, lord: data.own?.lord ?? null }),
      ),
    successionCredits: data.own?.successionCredits ?? 0,
    lords: data.lords.map(houseLinkOf),
    vassals: data.vassals.map(houseLinkOf),
    others: data.others.map(houseLinkOf),
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
    waiting: 0,
  };
}
