import { ageGroup, ageYears } from './people';
import { FORGE, REFINE, SMELT } from './iron-rates';
import { CRAFT_NEEDS, IRON } from './rules';
import { smithHead, smithSons } from './smith-supply';
import type { CraftStocks, Person, Sex, VillageState } from './types';

// Kovář – od rudy po hřivny a nástroje (production-chains.md – Kovář; Martin 20. 10. 2026:
// „Kovař si donese/doveze dřevěné uhlí a železnou rudu. Pak vytaví železnou houbu v redukční peci
// za pomocí ručního měchadla, houbu překove v železnou hřivnu/hřivny, ze kterých může vyrábět
// nástroje nebo mohou jít na obchod.“, „V liště jenom hřivny“; čísla návrh Clauda – IRON
// v rules.ts). Řetěz kovárny: ruda a uhlí → tavba (s měchařem) → železná houba → překování →
// hřivny → kování → nástroje do vybavení domácností. Nástroje nejsou zásoba vsi, ale vybavení
// (`VillageState.toolEquipmentKg`); v liště a v obchodu jsou hřivny. Čisté funkce bez stavu
// navíc – kroky dne volá kovárna (`workSmith` v crafts.ts).

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Nástroje ve vybavení domácností (kg; chybí = 0). */
export function toolEquipmentKg(state: Pick<VillageState, 'toolEquipmentKg'>): number {
  return state.toolEquipmentKg ?? 0;
}

/** Hřivny vsi (kg). */
export function ironBarsKg(state: Pick<VillageState, 'crafts'>): number {
  return state.crafts?.ironBarsKg ?? 0;
}

/** Železná houba u kovárny (kg). */
export function bloomKg(state: Pick<VillageState, 'crafts'>): number {
  return state.crafts?.bloomKg ?? 0;
}

/** Potřeba nástrojů vsi (kg): CRAFT_NEEDS.toolsKgPerWorker na každého od 14 let (crafts.md). */
export function toolNeedKg(state: Pick<VillageState, 'people'>, day: number): number {
  const workers = state.people.filter((p) => ageGroup(p, day) !== 'child').length;
  return CRAFT_NEEDS.toolsKgPerWorker * workers;
}

/**
 * Zásoba hřiven, kterou kovář drží (kg – production-chains.md, Kovář): na IRON.barsReserveYears
 * obnovy vybavení – nástroje, které ves za rok opotřebí, krát hřivny na kg nástrojů.
 */
export function barsReserveKg(state: Pick<VillageState, 'people'>, day: number): number {
  return (
    toolNeedKg(state, day) *
    CRAFT_NEEDS.toolWearPerYear *
    IRON.barsReserveYears *
    IRON.barsPerToolKg
  );
}

/**
 * Co kovárnám vsi chybí (kg – production-chains.md, Kovář): nástroje do potřeby vybavení
 * (`forgeKg`), hřivny do zásoby i na tyto nástroje (`barsKg`) a houba na hřivny, které z houby
 * u kovárny nevyjdou (`bloomKg`). Přebytky se netaví.
 */
export interface IronDeficit {
  forgeKg: number;
  barsKg: number;
  bloomKg: number;
}

/**
 * Chybějící nástroje, hřivny a houba: vybavení do potřeby `needKg`, hřivny do `barsTargetKg`
 * (zásoba na rok obnovy a zakázky kování k vozům) a na chybějící nástroje, houba na hřivny, které
 * nepokryje houba u kovárny.
 */
export function ironDeficit(input: {
  equipmentKg: number;
  needKg: number;
  barsKg: number;
  bloomKg: number;
  barsTargetKg: number;
}): IronDeficit {
  const forgeKg = Math.max(0, input.needKg - input.equipmentKg);
  const barsKg = Math.max(0, input.barsTargetKg + forgeKg * FORGE.barsKgPerKg - input.barsKg);
  const bloomKg = Math.max(0, barsKg * REFINE.bloomKgPerKg - input.bloomKg);
  return { forgeKg, barsKg, bloomKg };
}

/**
 * Práce celého řetězu, který kovárnám chybí (čd): kování, překování a tavba – výkon dílny podle
 * praxe `skill` (crafts.md – Učení řemesla) a tempo tavby `smeltRate` (sám kovář polovina).
 */
export function ironWorkManDays(deficit: IronDeficit, skill: number, smeltRate: number): number {
  const s = Math.max(EPSILON, skill);
  return (
    (deficit.forgeKg * FORGE.manDaysPerKg) / s +
    (deficit.barsKg * REFINE.manDaysPerKg) / s +
    (deficit.bloomKg * SMELT.manDaysPerKg) / (s * Math.max(EPSILON, smeltRate))
  );
}

/** Uhlí celého řetězu, který kovárnám chybí (kg). */
export function ironDeficitCharcoalKg(deficit: IronDeficit): number {
  return (
    deficit.forgeKg * FORGE.charcoalKgPerKg +
    deficit.barsKg * REFINE.charcoalKgPerKg +
    deficit.bloomKg * SMELT.charcoalKgPerKg
  );
}

/**
 * Kdo u tavby šlape měch (production-chains.md – Kovář): dospělý z domácnosti kováře (`adult`),
 * nebo syn 10–13 let (`son` – ten den nepase); chybí = kovář je sám a taví polovičním tempem.
 */
export interface BellowsHelper {
  personId: number;
  age: number;
  sex: Sex | null;
  kind: 'adult' | 'son';
}

/**
 * Měchař kovárny `smithId` v den `day` (návrh Clauda): napřed dospělý z domácnosti (ne kovář sám)
 * – nejmladší, jeho práce je v práci dílny; jinak syn kováře od IRON.bellowsFromAge do 13 let,
 * který dnes nenosí uhlí (`busy`) – nejstarší; jinak nikdo (null).
 */
export function smithBellows(
  state: Pick<VillageState, 'people'>,
  smithId: number,
  day: number,
  busy: ReadonlySet<number> = new Set(),
): BellowsHelper | null {
  const members = state.people.filter((p) => p.dwellingId === smithId);
  const head = smithHead(members, day);
  const adults = members
    .filter((p) => p.id !== head?.id && ageGroup(p, day) === 'adult')
    .sort((a, b) => b.bornDay - a.bornDay || a.id - b.id);
  const adult = adults[0];
  if (adult) return helper(adult, day, 'adult');
  const son = smithSons(state, smithId, day).find(
    (s) => s.age >= IRON.bellowsFromAge && !busy.has(s.id) && isChild(members, s.id, day),
  );
  if (!son) return null;
  return helper(
    members.find((p) => p.id === son.id)!,
    day,
    'son',
  );
}

/** Je člověk `id` z `members` dítě (pod 14 let)? */
function isChild(members: readonly Person[], id: number, day: number): boolean {
  const p = members.find((m) => m.id === id);
  return !!p && ageGroup(p, day) === 'child';
}

function helper(person: Person, day: number, kind: BellowsHelper['kind']): BellowsHelper {
  return { personId: person.id, age: ageYears(person.bornDay, day), sex: person.sex ?? null, kind };
}

/** Tempo tavby: s měchařem celé, sám kovář IRON.aloneRate. */
export function smeltRate(bellows: BellowsHelper | null): number {
  return bellows ? 1 : IRON.aloneRate;
}

/** Zásoby a práce, ze kterých kovárna dnes vyrábí (kg, čd). */
export interface IronStepInput {
  /** Práce dílny, která na krok zbyla (čd). */
  labor: number;
  skill: number;
  /** Uhlí u kovárny (kg) – Infinity = kolik by kovárna spálila, kdyby ho měla dost. */
  charcoalKg: number;
}

/** Výsledek kroku řetězu: kolik vyrobil (kg), práce (čd) a spálené uhlí (kg). */
export interface IronStep {
  kg: number;
  labor: number;
  charcoalKg: number;
}

/**
 * Kování nástrojů z hřiven do vybavení (kg nástrojů): nejvýš `wantedKg`, kolik dovolí práce,
 * hřivny a uhlí.
 */
export function forgeStep(input: IronStepInput & { wantedKg: number; barsKg: number }): IronStep {
  const perKg = FORGE.manDaysPerKg / Math.max(EPSILON, input.skill);
  const kg = Math.max(
    0,
    Math.min(
      input.wantedKg,
      input.labor / perKg,
      input.barsKg / FORGE.barsKgPerKg,
      input.charcoalKg / FORGE.charcoalKgPerKg,
    ),
  );
  return { kg, labor: kg * perKg, charcoalKg: kg * FORGE.charcoalKgPerKg };
}

/** Překování houby na hřivny (kg hřiven): nejvýš `wantedKg`, kolik dovolí práce, houba a uhlí. */
export function refineStep(input: IronStepInput & { wantedKg: number; bloomKg: number }): IronStep {
  const perKg = REFINE.manDaysPerKg / Math.max(EPSILON, input.skill);
  const kg = Math.max(
    0,
    Math.min(
      input.wantedKg,
      input.labor / perKg,
      input.bloomKg / REFINE.bloomKgPerKg,
      input.charcoalKg / REFINE.charcoalKgPerKg,
    ),
  );
  return { kg, labor: kg * perKg, charcoalKg: kg * REFINE.charcoalKgPerKg };
}

/**
 * Tavba v redukční peci (kg houby): nejvýš `wantedKg`, kolik dovolí práce (s měchařem celé tempo,
 * sám kovář `rate` – polovina), ruda a uhlí.
 */
export function smeltStep(
  input: IronStepInput & { wantedKg: number; oreKg: number; rate: number },
): IronStep {
  const perKg = SMELT.manDaysPerKg / Math.max(EPSILON, input.skill * input.rate);
  const kg = Math.max(
    0,
    Math.min(
      input.wantedKg,
      input.labor / perKg,
      input.oreKg / SMELT.oreKgPerKg,
      input.charcoalKg / SMELT.charcoalKgPerKg,
    ),
  );
  return { kg, labor: kg * perKg, charcoalKg: kg * SMELT.charcoalKgPerKg };
}

/** Zásoba nástrojů z doby před hřivnami (crafts.md – zásoba `toolsKg`). */
type LegacyStocks = CraftStocks & { toolsKg?: number };

/**
 * Ves uložená před hřivnami (production-chains.md – Kovář, Starší vsi): dnešní zásoba nástrojů se
 * rozdělí do vybavení domácností do potřeby vsi, přebytek nad ni se přidá k hřivnám (kg ÷
 * IRON.barsPerToolKg – návrh Clauda, dílny pracují dál). Bez zásoby nástrojů tentýž objekt;
 * idempotentní (jako `withCraftSkill`).
 */
export function withToolEquipment(state: VillageState): VillageState {
  const legacy = state.crafts as LegacyStocks | undefined;
  if (legacy?.toolsKg === undefined) return state;
  const tools = Math.max(0, legacy.toolsKg);
  const equipment = Math.min(tools, toolNeedKg(state, state.lastDay));
  const surplus = (tools - equipment) / IRON.barsPerToolKg;
  const crafts: LegacyStocks = { ...legacy };
  delete crafts.toolsKg;
  if (surplus > EPSILON) crafts.ironBarsKg = (crafts.ironBarsKg ?? 0) + surplus;
  return {
    ...state,
    crafts,
    toolEquipmentKg: toolEquipmentKg(state) + equipment,
  };
}
