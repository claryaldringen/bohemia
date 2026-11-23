// Počasí roku a pohromy v rozhraní (disasters.md – Co hráč vidí): ikona počasí v liště, ochrana
// a ztráty dílu v panelu, zdražení u sousedů a upozornění. Jen co už je vidět (`revealedWeather`,
// zápisy kroniky) – nikdy seed počasí, vynucené pohromy (`override`) ani budoucí rok.

import {
  cropWeatherOf,
  harvestYearOf,
  hasWeather,
  partWeatherFactor,
  PROTECTION,
  revealedWeather,
  LOCAL_DISASTER_KINDS,
  type ChronicleEvent,
  type Crop,
  type FloodLevel,
  type SummerWeather,
  type TornadoStrength,
  type VillageState,
  type WinterWeather,
} from '@bohemia/game';
import { FLOOD_LEVEL_NAMES } from './village-view-chronicle';
import { PROTECTION_LEVELS, sceneFlood } from './weather-view';

type WeatherState = Pick<VillageState, 'weatherSeed' | 'disasters'>;

/** Počasí roku pro horní lištu – jen neobvyklé a už vidět; povodeň, dokud ve vsi leží voda a bahno. */
export interface WeatherView {
  year: number;
  /** Zlé nebo dobré léto, už vidět (sucho od 1. 5., ostatní od 1. 6.). */
  summer?: Exclude<SummerWeather, 'normal'>;
  /** Zlá zima, už vidět (holomráz od 1. 2., dlouhá zima od 1. 3.). */
  winter?: Exclude<WinterWeather, 'normal'>;
  /** Povodeň, která vsi něco zatopila: stupeň a výška vody nad hladinou potoka (m). */
  flood?: { level: FloodLevel; heightM: number };
}

/** Počasí roku dne `day` pro lištu; ves bez počasí kraje nebo obyčejný rok bez vody – undefined. */
export function weatherView(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
): WeatherView | undefined {
  if (!hasWeather(state)) return undefined;
  const seen = revealedWeather(state, day);
  const summer = seen.summer !== undefined && seen.summer !== 'normal' ? seen.summer : undefined;
  const winter = seen.winter !== undefined && seen.winter !== 'normal' ? seen.winter : undefined;
  const record = state.disasters?.flood;
  const flood = record && sceneFlood(state, day) ? record : undefined;
  if (!summer && !winter && !flood) return undefined;
  return {
    year: seen.year,
    ...(summer ? { summer } : {}),
    ...(winter ? { winter } : {}),
    ...(flood ? { flood: { level: flood.level, heightM: flood.heightM } } : {}),
  };
}

/** Názvy léta a zimy v popiscích lišty (disasters.md – Léto, Zima). */
const SUMMER_NAMES: Record<Exclude<SummerWeather, 'normal'>, string> = {
  good: 'Dobré léto',
  dry: 'Suché léto',
  drought: 'Kruté sucho',
  wet: 'Deštivé léto',
  wetHarvest: 'Mokré žně',
};

/** Násobek jako změna v procentech („−25 %“, „+15 %“). */
export function signedPercent(factor: number): string {
  const change = Math.round((factor - 1) * 100);
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} %`;
}

/** Ikona počasí (upozornění): prasklá zem, mrak s deštěm, klas se sluncem, vločka s mrazem, voda. */
export const WEATHER_ICONS = {
  good: 'good-summer',
  dry: 'drought',
  drought: 'drought',
  wet: 'rain',
  wetHarvest: 'rain',
  blackFrost: 'frost',
  long: 'frost',
  flood: 'flood',
} as const;

/**
 * Ochrana dílu pro panel (disasters.md – Ochrana dílu): zeleň po stupních 0–4 (lístky) a vlhkost –
 * voda blízko, niva, vyvýšené místo, svah. Díl bez údaje má typickou zeleň.
 */
export interface PartProtectionView {
  level: number;
  water?: true;
  lowland?: true;
  raised?: true;
  slope?: true;
}

/** Ochrana dílu `partId`; ves bez počasí kraje ji nemá (undefined). */
export function partProtectionView(
  state: WeatherState,
  partId: number,
): PartProtectionView | undefined {
  if (!hasWeather(state)) return undefined;
  const part = state.disasters?.protection?.parts[String(partId)];
  const green = Math.min(1, Math.max(0, part?.green ?? PROTECTION.noLandscapeGreen));
  return {
    level: Math.round(green * PROTECTION_LEVELS),
    ...(part?.nearWater ? { water: true as const } : {}),
    ...(part?.lowland ? { lowland: true as const } : {}),
    ...(part?.raised ? { raised: true as const } : {}),
    ...(part?.slope ? { slope: true as const } : {}),
  };
}

/**
 * Odhad ztrát úrody dílu za rok sklizně (celá procenta hrubé úrody, jako škoda zvěře): počasí,
 * které je vidět (záporné = dobré léto přidá), kroupy, povodeň a smršť, které už přišly.
 */
export interface PartLossesView {
  weather?: number;
  hail?: number;
  flood?: number;
  tornado?: number;
}

const percent = (share: number | undefined): number => Math.round((share ?? 0) * 100);

/** Ztráty dílu letos; nic – undefined. `crop` = plodina dílu v roce sklizně (bez ní jen pohromy). */
export function partLossesView(
  state: WeatherState,
  day: number,
  partId: number,
  crop: Crop | undefined,
): PartLossesView | undefined {
  if (!hasWeather(state)) return undefined;
  const key = String(partId);
  const result: PartLossesView = {};
  const losses = state.disasters?.losses;
  if (losses && losses.year === harvestYearOf(day)) {
    for (const kind of ['hail', 'flood', 'tornado'] as const) {
      const lost = percent(losses[kind]?.[key]);
      if (lost > 0) result[kind] = lost;
    }
  }
  if (crop) {
    const weather = cropWeatherOf(state, day, true);
    const factor = partWeatherFactor(weather, crop, state.disasters?.protection?.parts[key]);
    const lost = Math.round((1 - factor) * 100);
    if (lost !== 0) result.weather = lost;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Popisek ochrany dílu – co chrání zeleň a jak ji mění vlhkost (disasters.md – Ochrana dílu). */
export function protectionLabel(p: PartProtectionView): string {
  const base =
    p.level === 0
      ? 'Bez stromů – pole nic nechrání před suchem, holomrazem ani kroupami'
      : 'Stromy chrání před suchem, holomrazem a kroupami';
  const extras = [
    ...(p.water ? ['voda blízko – sucho méně'] : []),
    ...(p.raised ? ['vyvýšené místo – sucho a mráz víc'] : []),
    ...(p.lowland ? ['niva – mokro víc'] : []),
    ...(p.slope ? ['svah – mokro méně'] : []),
  ];
  return extras.length > 0 ? `${base}; ${extras.join(', ')}` : base;
}

/** Řádek odhadu ztrát dílu v panelu: ikona, popisek a změna úrody („−60 %“). */
export interface PartLossRow {
  key: keyof PartLossesView;
  icon: string;
  name: string;
  text: string;
  /** Ztráta (ne zisk dobrého léta) – červeně od 10 % jako škoda zvěře. */
  alert: boolean;
}

/** Řádky odhadu ztrát dílu (počasí, kroupy, povodeň, smršť) podle počasí roku v liště. */
export function partLossRows(
  losses: PartLossesView,
  weather: WeatherView | undefined,
): PartLossRow[] {
  const rows: PartLossRow[] = [];
  const row = (key: keyof PartLossesView, icon: string, name: string): void => {
    const lost = losses[key];
    if (lost === undefined) return;
    rows.push({ key, icon, name, text: signedPercent(1 - lost / 100), alert: lost >= 10 });
  };
  const summer = weather?.summer;
  const winter = weather?.winter;
  const weatherName = summer
    ? SUMMER_NAMES[summer]
    : winter === 'blackFrost'
      ? 'Holomráz'
      : 'Počasí';
  row(
    'weather',
    WEATHER_ICONS[summer ?? winter ?? 'drought'],
    `${weatherName} – odhad úrody dílu letos`,
  );
  row('hail', 'hail', 'Kroupy – ztráta úrody dílu letos');
  row('flood', 'flood', 'Povodeň – ztráta úrody dílu letos');
  row('tornado', 'tornado', 'Smršť – polehlé obilí dílu letos');
  return rows;
}

// ---------------------------------------------------------------- upozornění ----

/** Druhy upozornění na počasí a pohromy (disasters.md – Co hráč vidí). */
export type DisasterNoticeKind =
  'drought' | 'wet-harvest' | 'black-frost' | 'hail' | 'flood' | 'fire' | 'fire-out' | 'tornado';

export interface DisasterNotice {
  kind: DisasterNoticeKind;
  tone: 'warn';
  text: string;
}

/** Upozornění na počasí roku – platí, dokud je počasí vidět; ohlásí se, když nově vznikne. */
const WEATHER_NOTICES = {
  // Martin 27. 10. 2026 schválil text „Sucho – nejvíc trpí pole bez stromů“
  drought: { kind: 'drought', tone: 'warn', text: 'Sucho – nejvíc trpí pole bez stromů' },
  'wet-harvest': { kind: 'wet-harvest', tone: 'warn', text: 'Mokré žně' },
  'black-frost': { kind: 'black-frost', tone: 'warn', text: 'Holomráz – ozim vymrzá' },
} as const satisfies Record<string, DisasterNotice>;

/** Upozornění odhaleného počasí roku (sucho i kruté sucho, mokré žně, holomráz). */
export function weatherNotices(weather: WeatherView | undefined): DisasterNotice[] {
  if (!weather) return [];
  const notices: DisasterNotice[] = [];
  if (weather.summer === 'dry' || weather.summer === 'drought') {
    notices.push(WEATHER_NOTICES.drought);
  }
  if (weather.summer === 'wetHarvest') notices.push(WEATHER_NOTICES['wet-harvest']);
  if (weather.winter === 'blackFrost') notices.push(WEATHER_NOTICES['black-frost']);
  return notices;
}

/** Zápis kroniky o pohromě v pohledu (podklad upozornění). */
export interface DisasterChronicleEntry {
  day: number;
  kind: ChronicleEvent['kind'];
  /** Stupeň vody (`flood`). */
  level?: FloodLevel;
  /** Síla smrště (`tornado`). */
  strength?: TornadoStrength;
  /** Potlučené díly (`hail`). */
  parts?: number;
  /** Shořelé domy (`fire`). */
  dwellings?: number;
}

/** Údaje zápisu kroniky o pohromě pro pohled (`chronicle` ve `VillageView`). */
export function disasterChronicleFields(
  event: ChronicleEvent,
): Pick<DisasterChronicleEntry, 'level' | 'strength' | 'parts' | 'dwellings'> {
  switch (event.kind) {
    case 'flood':
      return { level: event.level };
    case 'tornado':
      return { strength: event.strength };
    case 'hail':
      return { parts: event.partIds.length };
    case 'fire':
      return { dwellings: event.burnedDwellingIds.length };
    default:
      return {};
  }
}

/** „Vyhořel dům“, „Vyhořely 2 domy“, „Vyhořelo 5 domů“. */
function burnedText(n: number): string {
  if (n <= 1) return 'Vyhořel dům';
  if (n <= 4) return `Vyhořely ${n} domy`;
  return `Vyhořelo ${n} domů`;
}

/** Upozornění k zápisu kroniky o pohromě; požár jako fakt (vyhořelo), jiný zápis null. */
export function disasterEntryNotice(entry: DisasterChronicleEntry): DisasterNotice | null {
  switch (entry.kind) {
    case 'hail':
      return {
        kind: 'hail',
        tone: 'warn',
        text: (entry.parts ?? 0) > 0 ? 'Kroupy potloukly obilí' : 'Kroupy',
      };
    case 'flood':
      return {
        kind: 'flood',
        tone: 'warn',
        text: entry.level ? `Povodeň – ${FLOOD_LEVEL_NAMES[entry.level].toLowerCase()}` : 'Povodeň',
      };
    case 'tornado':
      return {
        kind: 'tornado',
        tone: 'warn',
        text: entry.strength && !['F0', 'F1'].includes(entry.strength) ? 'Silná smršť' : 'Smršť',
      };
    case 'fire':
      return { kind: 'fire-out', tone: 'warn', text: burnedText(entry.dwellings ?? 1) };
    default:
      return null;
  }
}

/**
 * Nové pohromy z kroniky mezi dvěma pohledy (dny `previousDay` → `nextDay`): kroupy, povodeň
 * a smršť, když přibudou; požár v jeho den „Hoří!“ (scéna ho právě kreslí), den po něm (nebo když
 * proběhl celý mezi pohledy) „Vyhořel dům“. Každý druh nejvýš jednou.
 */
export function disasterNotices(
  chronicle: readonly DisasterChronicleEntry[],
  previousDay: number,
  nextDay: number,
): DisasterNotice[] {
  const seen = new Set<DisasterNoticeKind>();
  const notices: DisasterNotice[] = [];
  const add = (notice: DisasterNotice | null): void => {
    if (!notice || seen.has(notice.kind)) return;
    seen.add(notice.kind);
    notices.push(notice);
  };
  for (const entry of [...chronicle].reverse()) {
    if (entry.kind === 'fire') {
      if (entry.day > previousDay && entry.day === nextDay) {
        add({ kind: 'fire', tone: 'warn', text: 'Hoří!' });
      } else if (entry.day >= previousDay && entry.day < nextDay) {
        add(disasterEntryNotice(entry));
      }
      continue;
    }
    if (entry.day > previousDay) add(disasterEntryNotice(entry));
  }
  return notices;
}

/** Pohromy jiné vsi hráče pro upozornění z ní (`VillageListItem.disasters`). */
export interface OtherVillageDisasters {
  /** Upozornění odhaleného počasí roku (`weatherNotices`). */
  weather?: DisasterNotice[];
  /** Poslední místní pohroma v kronice: den a upozornění (požár jako „Vyhořel dům“). */
  last?: { day: number; notice: DisasterNotice };
}

/** Počasí a poslední místní pohroma vsi pro přepínač vsí; nic – undefined. */
export function otherVillageDisasters(
  state: Pick<VillageState, 'weatherSeed' | 'disasters' | 'chronicle'>,
  day: number,
): OtherVillageDisasters | undefined {
  const weather = weatherNotices(weatherView(state, day));
  let last: OtherVillageDisasters['last'];
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const event = state.chronicle[i];
    if (!event || !LOCAL_DISASTER_KINDS.has(event.kind)) continue;
    const notice = disasterEntryNotice({
      day: event.day,
      kind: event.kind,
      ...disasterChronicleFields(event),
    });
    if (notice) last = { day: event.day, notice };
    break;
  }
  if (weather.length === 0 && !last) return undefined;
  return { ...(weather.length > 0 ? { weather } : {}), ...(last ? { last } : {}) };
}
