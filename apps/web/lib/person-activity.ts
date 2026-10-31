// Co vybraná postava právě dělá – krátká věta do panelu postavy (docs/design/villagers.md – Výběr
// postavy; Martin 20. 10. 2026: „žena rolníka, jde pro vodu. kovář – jde pro uhlí, uhlíř – staví
// milíř, tesař – jde do vesnice XY pro kování k vozu“). Z úlohy postavy dne (villager-roster.ts),
// kde v pochůzce je (tam, zpět, doma) a dat vsi ve scéně. Čistý modul.
import type { Craft, HerdSpecies, KilnStage } from '@bohemia/game';
import { crewActivityText, type DraftFigureState } from './draft-activity';
import type { PersonJob } from './scene/villager-roster';
import type { VillagerStage } from './scene/villager-motion';
import type { LaborTarget, SceneVillage } from './village-view';

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
  if (state.hidden) return 'doma';
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
      return stage === 'combat' ? 'cvičí boj' : 'cvičí lukostřelbu';
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
    case 'share':
      if (job.activity === 'fell') return 'jde do lesa';
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
    field: ['jde na pole', 'je na poli', 'vrací se z pole'],
    kiln: ['jde k milíři', 'je u milíře', 'vrací se od milíře'],
  };
  const [out, end, back] = texts[kind] ?? ['jde', 'stojí', 'vrací se'];
  return stage === 'end' ? end : stage === 'back' ? back : out;
}

function fetchText(goods: 'charcoal' | 'ore' | 'clay', stage: VillagerStage | null): string {
  const texts = {
    charcoal: ['jde pro uhlí k uhlíři', 'nakládá uhlí', 'nese uhlí od uhlíře'],
    ore: ['jde pro rudu', 'nakládá rudu', 'nese rudu do kovárny'],
    clay: ['jde pro hlínu', 'nakládá hlínu', 'nese hlínu do dílny'],
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
      return 'pracuje u domu';
    case 'trade':
      return 'nese zboží k sousedům';
    case 'haul':
      if (job.job === 'charcoal') return 'veze uhlí';
      if (job.job === 'water') return 'veze vodu';
      if (job.job === 'seed') return 'veze osivo';
      if (t.kind === 'field') return 'nakládá snopy na vůz';
      if (t.kind === 'meadow') return 'nakládá seno na vůz';
      if (t.kind === 'trees') return 'nakládá klády na vůz';
      return 'nakládá vůz';
    case 'ore':
      return 'kope rudu';
    case 'clay':
      return 'kope hlínu';
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
  return 'staví';
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
