// Co vybraná postava právě dělá – krátká věta do panelu postavy (docs/design/villagers.md – Výběr
// postavy; Martin 20. 10. 2026: „žena rolníka, jde pro vodu. kovář – jde pro uhlí, uhlíř – staví
// milíř, tesař – jde do vesnice XY pro kování k vozu“). Z úlohy postavy dne (villager-roster.ts),
// kde v pochůzce je (tam, zpět, doma) a dat vsi ve scéně. Čistý modul.
import type { Craft, HerdSpecies, KilnStage } from '@bohemia/game';
import { crewActivityText, type DraftFigureState } from './draft-activity';
import { stoneCartLoadSpot } from './scene/village-carts';
import type { MasterWork, PersonJob } from './scene/villager-roster';
import type { VillagerStage } from './scene/villager-motion';
import type { PhaseName } from './scene/villager-phases';
import type { LaborTarget, SceneDemolition, SceneVillage } from './village-view';

/**
 * Stav vybraného člověka ve scéně (villagers.ts hlásí změny): jeho postava dne a co dělá (`job`),
 * úsek pochůzky, jestli je teď vidět, a u pasáka druh stáda. Bez postavy dne `job` null.
 */
export interface PersonFigureState {
  id: number;
  job: PersonJob | null;
  stage: VillagerStage | null;
  hidden: boolean;
  herd: HerdSpecies | null;
  /**
   * Cesta k práci a z ní podle rozvrhu (villager-timetable.ts – práce na místě, úloha u objektu):
   * „jde na pole“, „jde domů“; pochůzku řekne její úsek (`stage`). Bez údaje není na cestě.
   */
  leg?: 'out' | 'back' | null;
  /** Vešel do domu – výběr se zruší (villagers.md – Výběr postavy; vojvoda ne). */
  indoors?: true;
  /**
   * Fáze činnosti, která má vlastní větu (villager-phases.ts – Fáze činností: váže snopy, pere
   * rudu, nese nástroje do domácností…); bez údaje podle úlohy a cesty.
   */
  phase?: PhaseName | null;
}

/** Stejný stav (změnu scéna hlásí, jen když se liší)? */
export function samePersonState(a: PersonFigureState | null, b: PersonFigureState | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    a.job === b.job &&
    a.stage === b.stage &&
    a.hidden === b.hidden &&
    a.herd === b.herd &&
    (a.leg ?? null) === (b.leg ?? null) &&
    (a.phase ?? null) === (b.phase ?? null) &&
    a.indoors === b.indoors
  );
}

const HERD_TEXTS: Record<HerdSpecies, string> = {
  sheep: 'pase ovce',
  goat: 'pase kozy',
  pig: 'pase prasata',
  cow: 'pase krávy',
};

const CRAFT_WORK: Record<Craft, string> = {
  smith: 'kuje',
  potter: 'točí hrnce',
  burner: 'pálí uhlí',
  carpenter: 'tesá',
};

const CRAFT_SITES: Record<Craft, string> = {
  smith: 'staví kovárnu',
  potter: 'staví hrnčířskou dílnu',
  burner: 'staví uhlířovu zemnici',
  carpenter: 'staví tesařskou dílnu',
};

const KILN_WORK: Record<KilnStage, string> = {
  wood: 'chystá dřevo na milíř',
  build: 'staví milíř',
  burn: 'hlídá milíř',
  draw: 'rozebírá milíř',
};

/**
 * Věty fází činností (villagers.md – Fáze činností); fáze bez věty (cesta, práce úlohy) řekne
 * úloha a úsek cesty.
 */
export const PHASE_TEXTS: Partial<Record<PhaseName, string>> = {
  bind: 'váže snopy',
  'load-sheaves': 'nakládá snopy na vůz',
  'rake-hay': 'hrabe seno',
  'heap-hay': 'skládá seno do kupek',
  'load-hay': 'nakládá seno na vůz',
  'wash-ore': 'pere rudu',
  'roast-ore': 'praží rudu',
  smelt: 'taví rudu v peci',
  refine: 'překovává železnou houbu na hřivny',
  forge: 'kuje nástroje',
  'deliver-tools': 'nese nástroje do domácností',
  'split-wood': 'štípe dřevo na milíř',
  'stack-kiln': 'staví milíř',
  'cover-kiln': 'zahrnuje milíř zeminou',
  'tend-kiln': 'hlídá milíř',
  'draw-coal': 'vytahuje uhlí z milíře',
  'basket-coal': 'sype uhlí do koše',
  'throw-pots': 'točí hrnce',
  'dry-pots': 'suší nádoby',
  'fire-pots': 'vsazuje nádoby do pece',
  'watch-fire': 'hlídá oheň v peci',
  'deliver-pots': 'nese nádoby do domácností',
  'hew-cart': 'otesává díly vozu',
  'build-cart': 'staví vůz',
  'bring-catch': 'nese úlovek domů',
  'to-harvest': 'jde pomoct se žněmi',
  'help-reap': 'pomáhá se žněmi',
  'help-bind': 'pomáhá vázat snopy',
  glean: 'sbírá paběrky',
  'from-harvest': 'vrací se ze žní',
  rest: 'postává před domem',
  'to-shrine': 'jde se pomodlit',
  pray: 'modlí se',
  'from-shrine': 'vrací se od modly',
  return: 'vrací se do dílny',
  // mistři huti na staveništi kostela (churches.md – Mistři huti při práci)
  measure: 'měří zdi latí',
  direct: 'řídí stavbu',
  'walk-walls': 'obchází zdi',
  'lay-out': 'vyměřuje půdorys',
  remeasure: 'přeměřuje zdi',
  inspect: 'kontroluje zdivo',
  'to-quarry': 'jde k lomu',
  'check-quarry': 'kontroluje lámání kamene',
  'to-kiln': 'jde k peci',
  'check-kiln': 'kontroluje pálení vápna',
  'to-sand': 'jde k písníku',
  'check-sand': 'kontroluje písník',
  'to-manor': 'jde za vojvodou',
  report: 'podává hlášení vojvodovi',
  'back-to-site': 'vrací se na staveniště',
  'break-limestone': 'tluče vápenec',
  'load-kiln': 'nosí vápenec do pece',
  stoke: 'přikládá do pece',
  'to-pit': 'jde k vápenné jámě',
  slake: 'hasí vápno',
  'quarry-stone': 'láme kámen',
  pause: 'odpočívá',
  'dress-stone': 'tesá kvádry',
  'carry-to-wall': 'nosí kámen ke zdi',
  'lay-stone': 'klade kameny do zdi',
  'mix-mortar': 'míchá maltu',
  plaster: 'omítá zdi',
  resume: 'vrací se k práci',
  // lom (churches.md – Mistři huti při práci, Lom): kameník a odnášeč
  'show-quarry': 'ukazuje, jak lámat kámen',
  'trim-stone': 'přisekává kámen',
  'take-stone': 'odebírá přisekané kameny',
  'stack-stone': 'odnáší kameny na hromadu',
  'load-stone': 'nakládá kámen na vůz',
};

/** Mistr huti v místě práce bez fáze s vlastní větou (villager-plan-masons.ts). */
const MASTER_TEXTS: Record<MasterWork, string> = {
  layout: 'vyměřuje půdorys',
  site: 'řídí stavbu',
  sand: 'dohlíží na kopání písku',
  kiln: 'pálí vápno',
  quarry: 'přisekává kámen',
  dress: 'tesá kvádry',
  walls: 'klade kameny do zdi',
  decor: 'omítá zdi',
  home: 'postává u domu',
};

/** Cesta mistra huti k práci (doma – vychází před dům). */
const MASTER_LEGS: Record<MasterWork, string> = {
  layout: 'jde na staveniště',
  site: 'jde na staveniště',
  sand: 'jde k písníku',
  kiln: 'jde k peci',
  quarry: 'jde do lomu',
  dress: 'jde na staveniště',
  walls: 'jde na staveniště',
  decor: 'jde na staveniště',
  home: 'vychází před dům',
};

/** Žena u dveří (villager-plan-folk.ts – `doorChore`): přede, vaří, tká, hlídá malé děti. */
const DOOR_CHORE_TEXTS: Partial<Record<VillagerStage, string>> = {
  spin: 'přede před domem',
  cook: 'vaří na ohništi před domem',
  weave: 'tká na stavu před domem',
  mind: 'hlídá děti u domu',
};

/**
 * Muž rodiny podle úseku dne rodiny (lord-day.ts – `traineePose`, riders.ts, lov): cvičí, jde
 * mezi místy, stojí u dvorce, u koně, na koni, na lovu, cestou k vedlejší manželce.
 */
const LORD_TEXTS: Partial<Record<VillagerStage, string>> = {
  bow: 'cvičí lukostřelbu',
  combat: 'cvičí boj',
  out: 'jde na cvičiště',
  back: 'jde ke dvorci',
  rest: 'stojí u dvorce',
  hitch: 'jde ke koni',
  wait: 'čeká u koně',
  ride: 'jede na koni',
  hunt: 'je na lovu',
  visit: 'jde za manželkou',
};

const DWELLING_SITES: Record<string, string> = {
  zemnice: 'staví zemnici',
  polozemnice: 'staví polozemnici',
  dvorec: 'staví dvorec',
};

/**
 * Věta o tom, co člověk dělá: bez postavy dne „doma“, za krajem mapy „pryč – …“, doma mezi
 * pochůzkami „doma“; jinak podle úlohy a úseku pochůzky („jde pro vodu“ / „nese vodu“). Oráč,
 * honák a vozka podle stavu svého spřežení či vozu (`draft` – draft-activity.ts: „orá“, „vede
 * spřežení“, „veze uhlí ke kováři“).
 */
export function personActivity(
  state: PersonFigureState | null,
  village: SceneVillage,
  draft: DraftFigureState | null = null,
): string {
  const job = state?.job;
  if (!state || !job) return 'doma';
  if (job.kind === 'caravan') return caravanText(job, state);
  if (job.kind === 'plough' || job.kind === 'cart') {
    return crewActivityText(job, draft, village) ?? 'doma';
  }
  if (state.hidden) {
    // vojvoda u vedlejší manželky (lord-day.ts – krok `away`) je v jejím domě, ne doma
    return job.kind === 'lord' && state.stage === 'visit' ? 'je u manželky' : 'doma';
  }
  const phase = state.phase ? PHASE_TEXTS[state.phase] : undefined;
  if (phase) return phase;
  if (state.leg) return legText(job, state.leg);
  const stage = state.stage;
  switch (job.kind) {
    case 'traffic':
      return trafficText(job.traffic, stage);
    case 'fetch':
      return fetchText(job.goods, stage);
    case 'herd':
      return state.herd ? HERD_TEXTS[state.herd] : 'pase';
    case 'elder':
      return 'odpočívá u domu';
    case 'funeral':
      if (stage === 'home') return 'vrací se domů';
      if (stage === 'ring') return 'stojí u pohřební hranice';
      return job.bearer ? 'nese máry' : 'jde v pohřebním průvodu';
    case 'wedding':
      if (stage === 'home') return 'vrací se ze svatby';
      if (stage === 'ring') {
        if (job.role === 'bride') return 'je oddávána';
        if (job.role === 'groom') return 'je oddáván';
        if (job.music === 'pipe') return 'hraje na píšťalu na svatbě';
        if (job.music === 'drum') return 'bubnuje na svatbě';
        return 'stojí u obřadu';
      }
      return 'jde na svatbu';
    case 'share':
      return shareText(job, stage, village);
    case 'watch':
      return 'hlídá pole';
    case 'fire':
      return 'hasí požár';
    case 'lord':
      if (job.household) return 'vede domácnost';
      return (stage && LORD_TEXTS[stage]) ?? 'jde ke dvorci';
    case 'priest':
      return 'stojí před kostelem';
    case 'master':
      return MASTER_TEXTS[job.work];
  }
}

/**
 * Cesta k práci na místě či k úloze u objektu a domů (villagers.md – Činnosti od začátku do konce:
 * vyjde z domu, dojde k práci, vrátí se domů).
 */
function legText(job: PersonJob, leg: 'out' | 'back'): string {
  if (leg === 'back') return 'jde domů';
  switch (job.kind) {
    case 'herd':
      return 'jde ke stádu';
    case 'watch':
      return 'jde hlídat pole';
    case 'elder':
      return 'vychází před dům';
    case 'lord':
      return job.household ? 'jde do práce' : 'jde na cvičiště';
    case 'priest':
      return 'jde ke kostelu';
    case 'master':
      return MASTER_LEGS[job.work];
    case 'share':
      if (job.activity === 'fell') return 'jde do lesa';
      if (job.activity === 'fish') return 'jde k tůni';
      if (job.activity === 'quarry') return 'jde do lomu';
      if (job.target.kind === 'field') return 'jde na pole';
      if (job.target.kind === 'orchard') return 'jde do sadu';
      return 'jde do práce';
    default:
      return 'jde do práce';
  }
}

function trafficText(kind: string, stage: VillagerStage | null): string {
  const texts: Record<string, [string, string, string]> = {
    water: ['jde pro vodu', 'nabírá vodu', 'nese vodu'],
    wood: ['jde pro dřevo', 'sbírá dřevo', 'nese dřevo'],
    kiln: ['jde k milíři', 'je u milíře', 'vrací se od milíře'],
  };
  const [out, end, back] = texts[kind] ?? ['jde', 'stojí', 'vrací se'];
  return stage === 'end' ? end : stage === 'back' ? back : out;
}

function fetchText(
  goods: 'charcoal' | 'ore' | 'clay' | 'stone' | 'block',
  stage: VillagerStage | null,
): string {
  // nosič kamene začíná u stavby – tam kámen skládá, nosič bloků na ploše lomu
  // (villager-plan-quarry.ts)
  if (goods === 'stone' && stage === 'rest') return 'skládá kámen u stavby';
  if (goods === 'block' && stage === 'rest') return 'skládá bloky u kameníka';
  const texts = {
    charcoal: ['jde pro uhlí k uhlíři', 'nakládá uhlí', 'nese uhlí od uhlíře'],
    ore: ['jde pro rudu', 'nakládá rudu', 'nese rudu do kovárny'],
    clay: ['jde pro hlínu', 'nakládá hlínu', 'nese hlínu do dílny'],
    stone: ['jde pro kámen do lomu', 'nakládá kámen do nůše', 'nosí kámen na stavbu'],
    block: ['jde ke skále pro bloky', 'nakládá vylomený blok do nůše', 'nosí blok do lomu'],
  } as const;
  const [out, end, back] = texts[goods];
  return stage === 'end' ? end : stage === 'back' ? back : out;
}

/** Karavana: výprava k sousedovi, nákup, cesta pro kování (jméno vsi se neskloňuje). */
function caravanText(
  job: Extract<PersonJob, { kind: 'caravan' }>,
  state: PersonFigureState,
): string {
  const trip = job.trip;
  const where = trip ? `vesnice ${trip.to}` : null;
  if (state.hidden) {
    if (!trip) return 'pryč – u sousedů';
    const away = `pryč – ve vesnici ${trip.to}`;
    return trip.kind === 'iron' ? `${away} pro kování k vozu` : away;
  }
  const back = state.stage === 'back';
  if (!trip) return back ? 'vrací se od sousedů' : 'jde s výpravou k sousedům';
  if (trip.kind === 'iron') {
    if (!job.porter) {
      if (state.stage === 'wait') return `chystá se do ${where} pro kování k vozu`;
      return back ? `nese kování k vozu z ${where}` : `jde do ${where} pro kování k vozu`;
    }
    return back ? `vrací se z ${where}` : `nese obilí do ${where} za kování k vozu`;
  }
  if (state.stage === 'wait') return `čeká na výpravu do ${where}`;
  if (trip.kind === 'purchase') {
    return back ? `nese nákup z ${where}` : `jde nakoupit do ${where}`;
  }
  return back ? `vrací se s výpravou z ${where}` : `jde s výpravou do ${where}`;
}

/** Podíl práce dne – činnost a místo z jádra. */
function shareText(
  job: Extract<PersonJob, { kind: 'share' }>,
  stage: VillagerStage | null,
  village: SceneVillage,
): string {
  const t = job.target;
  switch (job.activity) {
    case 'dig':
      return 'kope pole';
    case 'reclaim':
      return 'klučí zarostlé pole';
    case 'sow':
      return 'seje';
    case 'weed':
      return 'pleje';
    case 'harvest':
      return 'žne';
    case 'carry':
      return stage === 'out' ? 'jde pro snopy' : stage === 'back' ? 'nese snopy' : 'nosí snopy';
    case 'found-field':
      return 'zakládá pole';
    case 'thresh':
      return 'mlátí obilí';
    case 'plough':
      return 'orá';
    case 'mow':
      return 'seče';
    case 'milking':
      return 'dojí';
    case 'animal-care':
      return t.kind === 'pen' ? 'krmí dobytek v ohradě' : 'stará se o zvířata';
    case 'horse-care':
      return t.kind === 'pen' ? 'stará se o koně v ohradě' : 'stará se o koně';
    case 'horse-shoeing':
      return t.kind === 'pen' ? 'kuje koně u ohrady' : 'kuje koně';
    case 'slaughter':
      return 'porází dobytek';
    case 'herding':
      return 'pase';
    case 'watch':
      return 'hlídá pole';
    case 'fish':
      return 'chytá ryby';
    case 'snare':
      return 'staví oka na zajíce';
    case 'pen':
      return 'staví ohradu';
    case 'orchard-harvest':
      return t.kind === 'road' ? 'česá jablka u cesty' : 'česá jablka';
    case 'orchard-care':
      return 'stará se o sad';
    case 'orchard-plant':
      return t.kind === 'road' ? 'sází jabloně u cesty' : 'sází jabloně';
    case 'cemetery':
      return 'staví plot hřbitova';
    case 'repair':
      return repairText(t, village);
    case 'fell':
      return 'kácí strom';
    case 'build':
      return buildText(t, village);
    case 'craft':
      return craftText(t, village);
    case 'plant':
      return 'sází buky';
    case 'domestic':
      return (stage && DOOR_CHORE_TEXTS[stage]) ?? 'pracuje u domu';
    case 'trade':
      return 'nese zboží k sousedům';
    case 'haul':
      if (job.job === 'charcoal') return 'veze uhlí';
      if (job.job === 'water') return 'veze vodu';
      if (job.job === 'seed') return 'veze osivo';
      if (job.job === 'stone') return 'veze kámen na stavbu';
      if (t.kind === 'field') return 'nakládá snopy na vůz';
      if (t.kind === 'meadow') return 'nakládá seno na vůz';
      if (t.kind === 'trees') return 'nakládá klády na vůz';
      return 'nakládá vůz';
    case 'ore':
      return 'kope rudu';
    case 'clay':
      return 'kope hlínu';
    case 'quarry':
      if (!job.stacker) return 'láme kámen';
      // s vozem s kamenem u lomu nosí odnášeč kameny k vozu (villager-plan-quarry.ts – quarryPhases)
      return t.kind === 'quarry' && stoneCartLoadSpot(village, t.id)
        ? 'nakládá kámen na vůz'
        : 'odnáší kameny na hromadu';
    case 'grain-pit':
      return 'ukládá zrno do obilné jámy';
    case 'fetch':
      return 'nosí uhlí';
    case 'idle':
      return 'odpočívá';
  }
}

function repairText(t: LaborTarget, village: SceneVillage): string {
  if (t.kind === 'sacred') {
    const kind = village.sacred?.buildings.find((b) => b.id === t.id)?.kind;
    return kind === 'shrine' ? 'opravuje svatyni' : 'opravuje modlu';
  }
  return 'opravuje dům';
}

function buildText(t: LaborTarget, village: SceneVillage): string {
  if (t.kind === 'road') return 'upravuje cestu';
  if (t.kind === 'wagon') return 'staví vozovou cestu';
  if (t.kind === 'dwelling') return 'přestavuje dům';
  if (t.kind !== 'site') return 'staví';
  const site = village.dwellings.find((d) => d.id === t.id && !d.built);
  if (site) return site.craft ? CRAFT_SITES[site.craft] : (DWELLING_SITES[site.type] ?? 'staví');
  const sacred = village.sacred?.buildings.find((b) => b.id === t.id);
  if (sacred) return sacred.kind === 'shrine' ? 'staví svatyni' : 'staví modlu';
  const demolition = village.demolitions?.find((d) => d.id === t.id);
  if (demolition) return demolitionText(demolition);
  return 'staví';
}

/** Bourání (demolition.md – Bourání): „bourá zemnici“, „bourá kovárnu“, „bourá ohradu“… */
function demolitionText(d: SceneDemolition): string {
  if (d.structure === 'pen') return 'bourá ohradu';
  if (d.structure === 'idol') return 'bourá modlu';
  if (d.structure === 'shrine') return 'bourá svatyni';
  const site = d.craft ? CRAFT_SITES[d.craft] : (DWELLING_SITES[d.type ?? 'zemnice'] ?? 'staví');
  return site.replace('staví', 'bourá');
}

function craftText(t: LaborTarget, village: SceneVillage): string {
  if (t.kind === 'kiln') {
    const kiln =
      village.kilns?.find((k) => t.kiln !== undefined && k.id === t.kiln) ??
      village.kilns?.find((k) => k.burnerId === t.id);
    return kiln ? KILN_WORK[kiln.stage] : CRAFT_WORK.burner;
  }
  if (t.kind !== 'dwelling') return 'pracuje v dílně';
  const dwelling = village.dwellings.find((d) => d.id === t.id);
  if (dwelling?.craft === 'burner') {
    // uhlíř u svého milíře (crafts.md – Milíř u skácených buků)
    const kiln = village.kilns?.find((k) => k.burnerId === dwelling.id);
    return kiln ? KILN_WORK[kiln.stage] : CRAFT_WORK.burner;
  }
  return dwelling?.craft ? CRAFT_WORK[dwelling.craft] : 'pracuje v dílně';
}

/**
 * Věta o člověku ve skupině výpravy (expeditions.md – Výběr a skupina; lord-control.md – Co hráč
 * vidí): jede „je na cestě“, na místě „čeká (N dny)“ podle zbývajících dnů do návratu, při návratu
 * „vrací se domů“ – podle skupiny osoby (`PartyView`).
 */
export function journeyActivity(view: {
  phase: 'out' | 'returning' | 'done';
  waitDaysLeft: number | null;
}): string {
  if (view.phase === 'returning' || view.phase === 'done') return 'vrací se domů';
  if (view.waitDaysLeft === null) return 'je na cestě';
  const days = view.waitDaysLeft;
  return `čeká (${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dnů'})`;
}
