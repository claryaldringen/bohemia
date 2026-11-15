// Konce cesty hráče v pohledu na ves (paths.md – pravidlo 11, Co hráč vidí; Martin 25. 10. 2026:
// „Pokud cestu označím, měl bych v panelu cesty vidět, která místa to jsou a moci je také
// označit.“). Jádro určí, co na konci je (`chainEnds` – kotvy jako úklid), tady se z toho stane
// název do popisku, ikona a cíl výběru.
import {
  neighbourOf,
  roadChainIds,
  type Road,
  type RoadEnd,
  type VillageState,
} from '@bohemia/game';
import type { VillageTarget } from './scene/village-picking';
import { DIRECTION_NAMES } from './trade-names';
import { toVillage } from './village-name-cases';
import { DWELLING_NAMES } from './village-view-chronicle';

/**
 * Název a portrét křižovatky podle tvaru (paths.md – Křižovatky): hvězda (pět ramen) je kříž
 * s pátým ramenem – jmenuje se i vypadá v portrétu jako kříž.
 */
export const JUNCTION_NAMES = { cross: 'Křižovatka', y: 'Rozcestí', star: 'Křižovatka' } as const;
export const JUNCTION_ICONS = {
  cross: 'krizovatka-kriz',
  y: 'krizovatka-y',
  star: 'krizovatka-kriz',
} as const;

/** Konec cesty hráče pro panel cesty. */
export interface VillageRoadEnd {
  /** Místo (stavba, pole, voda…), křižovatka, kraj mapy, jiná cesta, nebo nikam (pravidlo 11). */
  kind: RoadEnd['kind'];
  /** Název do popisku („Obydlí – polozemnice“, „Křižovatka“, „Cesta do Lhoty“). */
  name: string;
  /** Ikona (celá cesta); kraj mapy a nikam ji nemají (šipka, varování). */
  icon: string | null;
  /** Šipka směru u kraje mapy. */
  arrow: string | null;
  /** Co klik vybere; kraj mapy, voda, les a nikam vybrat nejdou. */
  target: VillageTarget | null;
  /** Porušení pravidla 11 (nikam, jiná cesta bez křižovatky) – panel ukáže varování. */
  alert?: boolean;
  /** Výpis do konzole (`dwelling 12`, `junction 565`, `edge N`, `water`, `water:river`, `nikam`, `do road 3 (!)`). */
  log: string;
}

const build = (name: string): string => `/icons/build/${name}.png`;
const resource = (name: string): string => `/icons/resources/${name}.png`;

/** Stavby a cíle podle klíče trasy (před dvojtečkou) – název, ikona a druh výběru. */
const PLACES: Record<
  string,
  { name: string; icon: string; target?: Exclude<VillageTarget['kind'], 'dwelling'> }
> = {
  cemetery: { name: 'Hřbitov', icon: build('hrbitov'), target: 'cemetery' },
  pen: { name: 'Ohrada', icon: build('ohrada'), target: 'pen' },
  'threshing-floor': { name: 'Humno', icon: build('humno'), target: 'threshing-floor' },
  idol: { name: 'Modla', icon: build('modla'), target: 'sacred' },
  shrine: { name: 'Svatyně', icon: build('svatyne'), target: 'sacred' },
  'grain-pit': { name: 'Obilná jáma', icon: build('obilna-jama'), target: 'grain-pit' },
  field: { name: 'Pole', icon: build('pole'), target: 'field' },
  orchard: { name: 'Sad', icon: build('sad'), target: 'orchard' },
  oak: { name: 'Posvátný dub', icon: build('dub'), target: 'sacred-oak' },
  grove: { name: 'Dubový háj', icon: build('haj'), target: 'grove' },
  ore: { name: 'Rudiště', icon: build('rudiste'), target: 'ore-site' },
  clay: { name: 'Hliniště', icon: build('hliniste'), target: 'clay-site' },
  kiln: { name: 'Milíř', icon: build('milir'), target: 'kiln' },
  // voda na konci cesty: potok, u řeky `water:river` (Martin 14. 11. 2026: „teče tam přece potok“)
  water: { name: 'Potok', icon: resource('jar') },
  river: { name: 'Řeka', icon: resource('jar') },
  wood: { name: 'Les', icon: resource('wood') },
  pasture: { name: 'Pastva', icon: resource('cow') },
  meadow: { name: 'Louka', icon: resource('hay') },
};

const nowhere: VillageRoadEnd = {
  kind: 'none',
  name: 'Cesta tu nikam nevede.',
  icon: null,
  arrow: null,
  target: null,
  alert: true,
  log: 'nikam (!)',
};

function placeView(state: VillageState, place: string): VillageRoadEnd {
  const [prefix = '', rest] = place.split(':');
  const id = Number(rest);
  const dwelling =
    prefix === 'd' || prefix === 'dwelling' || prefix === 'site'
      ? state.dwellings.find((d) => d.id === id)
      : undefined;
  if (dwelling) {
    return {
      kind: 'place',
      name: `Obydlí – ${DWELLING_NAMES[dwelling.type].nominative.toLowerCase()}`,
      icon: build(dwelling.type),
      arrow: null,
      target: { kind: 'dwelling', id: dwelling.id },
      alert: false,
      log: `dwelling ${dwelling.id}`,
    };
  }
  // oprava modly či svatyně (`sacred:<id>`) – druh podle stavby
  const sacred = prefix === 'sacred' ? state.sacredBuildings?.find((b) => b.id === id) : undefined;
  // staveniště, které není obydlí, je humno (network-targets – `site:<id humna>`)
  const known =
    PLACES[
      prefix === 'site'
        ? 'threshing-floor'
        : prefix === 'sacred'
          ? (sacred?.kind ?? 'idol')
          : place === 'water:river'
            ? 'river'
            : prefix
    ];
  if (!known) {
    return {
      kind: 'place',
      name: 'Cíl cesty',
      icon: resource('walk'),
      arrow: null,
      target: null,
      alert: false,
      log: place,
    };
  }
  const target = known.target && Number.isFinite(id) ? { kind: known.target, id } : null;
  return {
    kind: 'place',
    name: known.name,
    icon: known.icon,
    arrow: null,
    target: target as VillageTarget | null,
    alert: false,
    log: target ? `${target.kind} ${id}` : prefix,
  };
}

/** Konec cesty pro panel – název, ikona, cíl výběru a výpis do konzole. */
export function roadEndView(
  state: VillageState,
  roads: readonly Road[],
  end: RoadEnd,
): VillageRoadEnd {
  switch (end.kind) {
    case 'place':
      return placeView(state, end.place);
    case 'junction': {
      const junction = (state.roads?.junctions ?? []).find((j) => j.id === end.id);
      const shape = junction?.shape ?? 'cross';
      return {
        kind: 'junction',
        name: JUNCTION_NAMES[shape],
        icon: build(JUNCTION_ICONS[shape]),
        arrow: null,
        target: { kind: 'junction', id: end.id },
        alert: false,
        log: `junction ${end.id}`,
      };
    }
    case 'edge':
      // cesta přes kraj mapy vede k sousedovi v tom směru (Martin 15. 11. 2026: „ta cesta přece
      // někam vede“)
      return {
        kind: 'edge',
        name: `Cesta ${toVillage(neighbourOf(state.seed, end.direction).name)}`,
        icon: null,
        arrow: DIRECTION_NAMES[end.direction].arrow,
        target: null,
        alert: false,
        log: `edge ${end.direction}`,
      };
    case 'road': {
      // cesta hráče = řetěz úseků, id je jeho první úsek (roads.md – Cesta pro hráče)
      const id = roadChainIds(roads, end.roadId)[0] ?? end.roadId;
      return {
        kind: 'road',
        name: 'Cesta končí na jiné cestě bez křižovatky.',
        icon: build('cesta'),
        arrow: null,
        target: { kind: 'road', id },
        alert: true,
        log: `road ${id} (!)`,
      };
    }
    case 'none':
      return nowhere;
  }
}
