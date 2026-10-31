// Fáze činnosti (docs/design/villagers.md – Činnosti od začátku do konce, Fáze činností; Martin
// 31. 10. 2026: „Tak ty kroky v animacích, které chybí, sis tam už vpasal sám, tak je můžeš rovnou
// doplnit.“): každá činnost rozvrhu (villager-schedule.ts) prochází fázemi od vyjití z domu po
// návrat – cesta ode dveří, práce v místě po fázích (žně a vázání snopů, praní a pražení rudy,
// kování, odnos do domácností…), návrat domů. Simulace se nemění, fáze jsou jen vizuální. Čistá
// funkce činnosti, role a losu podle člověka a začátku činnosti – bez Babylonu; počítá se, jen
// když se póza kreslí nebo se ptá panel vybrané postavy.
import { hash01 } from './smoke-schedule';
import { createVillagerPose, type VillagerClip } from './villager-motion';
import {
  activityPose,
  GRID_S,
  scheduleAt,
  type Activity,
  type Point,
  type ScheduleInput,
} from './villager-schedule';

/**
 * Co postava ve fázi dělá (panel postavy – person-activity.ts `PHASE_TEXTS`): `out` / `back` cesta
 * ode dveří a domů, `work` práce úlohy dne tak, jak ji kreslí plán dne (póza úlohy), `home` doma;
 * ostatní fáze rolí z tabulek návrhu (Fáze činností) – existující klip, případně jinde.
 */
export type PhaseName =
  | 'out'
  | 'work'
  | 'back'
  | 'home'
  // rolník o žních a na louce (Rolník – žně, svoz, seno)
  | 'bind'
  | 'load-sheaves'
  | 'rake-hay'
  | 'heap-hay'
  | 'load-hay'
  // kovář (Kovář)
  | 'wash-ore'
  | 'roast-ore'
  | 'smelt'
  | 'refine'
  | 'forge'
  | 'deliver-tools'
  // uhlíř a milíř (Uhlíř a milíř)
  | 'split-wood'
  | 'stack-kiln'
  | 'cover-kiln'
  | 'tend-kiln'
  | 'draw-coal'
  | 'basket-coal'
  // hrnčíř (Hrnčíř)
  | 'throw-pots'
  | 'dry-pots'
  | 'fire-pots'
  | 'watch-fire'
  | 'deliver-pots'
  // rybář – odnos úlovku domů (Rybář)
  | 'bring-catch'
  // pomoc o žních: cvičící muži, starší a nečinní (Vojvoda a synové, Děti a starší)
  | 'to-harvest'
  | 'help-reap'
  | 'help-bind'
  | 'glean'
  | 'from-harvest'
  // návrat k dílně z odnosu
  | 'return';

/**
 * Role fází – kterou posloupnost fází činnost dostane (z úlohy dne a stavu vsi –
 * villager-plan-phases.ts). Bez role jen cesta, práce úlohy a návrat.
 */
export type PhaseRole =
  | 'reap'
  | 'meadow'
  | 'load-sheaves'
  | 'load-hay'
  | 'smelt'
  | 'refine'
  | 'forge'
  | 'kiln-wood'
  | 'kiln-build'
  | 'kiln-burn'
  | 'kiln-draw'
  | 'pottery'
  | 'fish'
  | 'train'
  | 'elder'
  | 'idle';

/** Fáze role a kde se dělá: u místa úlohy, u cizího domu (odnos – `drop`), na poli žní (`aid`). */
type PhasePlace = 'site' | 'drop' | 'aid';

/**
 * Krok posloupnosti fází role (podíl práce v místě): `clip` – klip místo pózy úlohy (postava
 * stojí, kde ji fáze zastihla); bez klipu póza úlohy dne. Krok jinde (`place`) – postava tam dojde
 * (`go` / `come` – klip cesty) a vrátí se k místu úlohy.
 */
interface PhaseStep {
  name: PhaseName;
  share: number;
  clip?: VillagerClip;
  pace?: number;
  place?: PhasePlace;
}

/** Cesta na místo kroku jinde a zpět – jméno a klip (odnos nese koš, k poli jde s prázdnýma). */
const TRANSIT: Record<
  Exclude<PhasePlace, 'site'>,
  { go: PhaseName | null; come: PhaseName; clip: VillagerClip }
> = {
  // odnos – cesta tam je sama odnos (jméno kroku), zpět k dílně
  drop: { go: null, come: 'return', clip: 'carry' },
  aid: { go: 'to-harvest', come: 'from-harvest', clip: 'walk' },
};

/**
 * Posloupnosti fází rolí (villagers.md – Fáze činností; podíly práce v místě – návrh Clauda,
 * doladit hraním). Klipy jen stávající (`VillagerClip`); chybějící rekvizity (povříslo, hrábě,
 * vidle, kladivo a kleště, špalek, síto, nádoby, koš s nástroji, ryby) zatím nahrazuje rekvizita
 * klipu – úloha 9. Pořadí a podíly se losem mírně mění (`PHASE_JITTER`).
 */
export const PHASE_STEPS: Record<PhaseRole, readonly PhaseStep[]> = {
  // žně: srp, pak sehnutí nad snopem (vázání – zatím bez povříslu)
  reap: [
    { name: 'work', share: 0.35 },
    { name: 'bind', share: 0.15, clip: 'weed' },
    { name: 'work', share: 0.35 },
    { name: 'bind', share: 0.15, clip: 'weed' },
  ],
  // louka: seč, hrabání (motyka místo hrábí), kupky (zdvih nahoru – koš místo vidlí)
  meadow: [
    { name: 'work', share: 0.5 },
    { name: 'rake-hay', share: 0.3, clip: 'hoe', pace: 0.8 },
    { name: 'heap-hay', share: 0.2, clip: 'fruit' },
  ],
  // nakladač u vozu: nosí snopy, zdvih na vůz
  'load-sheaves': [
    { name: 'work', share: 0.55 },
    { name: 'load-sheaves', share: 0.45, clip: 'fruit' },
  ],
  'load-hay': [
    { name: 'work', share: 0.5 },
    { name: 'load-hay', share: 0.5, clip: 'fruit' },
  ],
  // tavba: praní rudy (sehnutí – síto chybí), pražení u ohně s lopatou, sypání do pece
  smelt: [
    { name: 'wash-ore', share: 0.15, clip: 'weed' },
    { name: 'roast-ore', share: 0.2, clip: 'winnow', pace: 0.7 },
    { name: 'smelt', share: 0.65 },
  ],
  // překování houby na hřivny – těžší, pomalejší údery (palice místo kladiva)
  refine: [
    { name: 'refine', share: 0.45, clip: 'build', pace: 0.7 },
    { name: 'work', share: 0.1 },
    { name: 'refine', share: 0.45, clip: 'build', pace: 0.7 },
  ],
  // kování nástrojů – rychlejší, lehčí údery, pak odnos do domácností (koš místo koše s nástroji)
  forge: [
    { name: 'forge', share: 0.7, clip: 'build', pace: 1.3 },
    { name: 'deliver-tools', share: 0.3, clip: 'idle', place: 'drop' },
  ],
  // milíř: štípání dřeva (sekera bez špalku), skládání
  'kiln-wood': [
    { name: 'split-wood', share: 0.6, clip: 'fell' },
    { name: 'stack-kiln', share: 0.4 },
  ],
  'kiln-build': [
    { name: 'stack-kiln', share: 0.6 },
    { name: 'cover-kiln', share: 0.4, clip: 'hoe' },
  ],
  // pálení: hlídá, občas zahrne průduch zeminou
  'kiln-burn': [
    { name: 'tend-kiln', share: 0.4, clip: 'idle' },
    { name: 'cover-kiln', share: 0.2, clip: 'hoe' },
    { name: 'tend-kiln', share: 0.4, clip: 'idle' },
  ],
  // vytahování uhlí (motyka místo hrábí), sypání do koše
  'kiln-draw': [
    { name: 'draw-coal', share: 0.6, clip: 'hoe' },
    { name: 'basket-coal', share: 0.4, clip: 'fruit' },
  ],
  // hrnčíř: kruh či šlapání (póza úlohy), sušení, vsazení do pece, hlídání ohně, odnos nádob
  pottery: [
    { name: 'throw-pots', share: 0.45 },
    { name: 'dry-pots', share: 0.15, clip: 'weed' },
    { name: 'fire-pots', share: 0.1, clip: 'fruit' },
    { name: 'watch-fire', share: 0.1, clip: 'idle' },
    { name: 'deliver-pots', share: 0.2, clip: 'idle', place: 'drop' },
  ],
  // rybář – loví (póza úlohy), úlovek nese domů v koši (`BACK_PHASE`)
  fish: [{ name: 'work', share: 1 }],
  // cvičící muži o žních (lord.md): po cvičení na pole – žnou a vážou
  train: [
    { name: 'work', share: 0.4 },
    { name: 'help-reap', share: 0.35, clip: 'reap', place: 'aid' },
    { name: 'help-bind', share: 0.25, clip: 'weed', place: 'aid' },
  ],
  // starší a nečinní o žních – paběrky na poli, pak zpět před dům
  elder: [
    { name: 'work', share: 0.4 },
    { name: 'glean', share: 0.6, clip: 'weed', place: 'aid' },
  ],
  idle: [
    { name: 'work', share: 0.3 },
    { name: 'glean', share: 0.7, clip: 'weed', place: 'aid' },
  ],
};

/** Návrat domů s nákladem – rybář nese úlovek (koš místo ryb). */
const BACK_PHASE: Partial<Record<PhaseRole, { name: PhaseName; clip: VillagerClip }>> = {
  fish: { name: 'bring-catch', clip: 'carry' },
};

/** O kolik se podíl kroku losem mění (± polovina – `share × (1 ± PHASE_JITTER / 2)`). */
export const PHASE_JITTER = 0.3;

/** Nejkratší fáze práce v místě (s) – kratší práce zůstane celá pózou úlohy. */
export const MIN_PHASE_S = 15;

/**
 * Krok jinde se udělá, jen když cesta tam a zpět zabere nejvýš tolik jeho délky – jinak zůstane
 * u místa úlohy (daleké pole žní, cizí dům na druhém konci vsi).
 */
export const TRANSIT_SHARE = 0.6;

const PHASE_SALT = 0x7a5e;

/**
 * Fáze činnosti (s): od `from` do `to`; `clip` – klip místo pózy úlohy (`pace` tempo), bez něj póza
 * úlohy dne; `at` – stojí jinde (krok jinde), `walk` – jde z bodu do bodu (cesta ke kroku jinde
 * a zpět). Cesta ode dveří a domů (`out` / `back`) kreslí póza činnosti jako dosud.
 */
export interface ActivityPhase {
  name: PhaseName;
  from: number;
  to: number;
  clip?: VillagerClip;
  pace?: number;
  at?: Point;
  walk?: { from: Point; to: Point };
}

/** Kde se dělají kroky jinde – odnos do cizího domu, pole žní; bez údaje se nedělají. */
export interface PhasePlaces {
  drop?: Point;
  aid?: Point;
}

/**
 * Fáze činnosti `a` (villagers.md – Fáze činností): doma jedna fáze `home`; jinak cesta ode dveří
 * (`out`, `start` → `arrive`), práce v místě po krocích role (`arrive` → `leave`) a návrat (`back`,
 * `leave` → `end`). Podíly kroků mírně mění los podle člověka a začátku činnosti (`seed`);
 * kroky jinde s cestou `walkS` (s, z místa úlohy) – bez údaje rovně 1 m/s. Přerušená činnost
 * (`cut`) končí v `end` – fáze po něm odpadnou. Součet délek fází = `end − start`.
 */
export function activityPhases(
  a: Activity,
  seed: number,
  walkS: (from: Point, to: Point) => number = (p, q) => Math.hypot(q.x - p.x, q.z - p.z),
): ActivityPhase[] {
  if (a.kind === 'home' || !a.task) return [{ name: 'home', from: a.start, to: a.end }];
  const end = a.end;
  if (a.retreat) return [{ name: 'back', from: a.start, to: end }];
  const role = a.task.role;
  const phases: ActivityPhase[] = [];
  const push = (p: ActivityPhase): void => {
    const to = Math.min(p.to, end);
    if (to > p.from) phases.push({ ...p, to });
  };
  push({ name: 'out', from: a.start, to: Math.min(a.arrive, end) });
  if (a.arrive < end) {
    const leave = Math.min(a.leave, end);
    for (const p of workPhases(a, seed, role, walkS)) {
      if (p.from >= leave) break;
      push({ ...p, to: Math.min(p.to, leave) });
    }
    if (a.leave < end) {
      const back = role ? BACK_PHASE[role] : undefined;
      push({
        name: back?.name ?? 'back',
        from: a.leave,
        to: end,
        ...(back ? { clip: back.clip } : {}),
      });
    }
  }
  return phases;
}

/** Práce v místě po krocích role – od `arrive` do `leave` (úloha u objektu jen pózou úlohy). */
function workPhases(
  a: Activity,
  seed: number,
  role: PhaseRole | undefined,
  walkS: (from: Point, to: Point) => number,
): ActivityPhase[] {
  const span = a.leave - a.arrive;
  const whole: ActivityPhase[] = [{ name: 'work', from: a.arrive, to: a.leave }];
  const task = a.task!;
  if (!role || task.kind === 'hold' || task.kind === 'errand' || !Number.isFinite(span)) {
    return whole;
  }
  const site = task.at;
  const places: PhasePlaces = task.places ?? {};
  // kroky jinde bez místa (dnes se nežne, nikam se nenese) – zůstanou u místa úlohy pózou úlohy
  const steps = PHASE_STEPS[role].filter((s) => !s.place || s.place === 'site' || places[s.place]);
  const weights = steps.map((s, k) => {
    const r = hash01((seed ^ PHASE_SALT) + k * 0x9e37, a.person, Math.round(a.start / GRID_S));
    return s.share * (1 + PHASE_JITTER * (r - 0.5));
  });
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || span < MIN_PHASE_S * steps.length) return whole;
  const out: ActivityPhase[] = [];
  let t = a.arrive;
  // po sobě jdoucí kroky na témž místě jinde – jedna cesta tam a jedna zpět
  for (let k = 0; k < steps.length;) {
    const s = steps[k]!;
    const place = s.place && s.place !== 'site' ? s.place : null;
    let j = k + 1;
    if (place) while (j < steps.length && steps[j]!.place === place) j++;
    const length = (weights.slice(k, j).reduce((sum, w) => sum + w, 0) / total) * span;
    const from = t;
    const to = j === steps.length ? a.leave : t + length;
    const target = place ? places[place]! : null;
    const go = target && site ? walkS(site, target) : 0;
    if (target && site && 2 * go <= TRANSIT_SHARE * (to - from)) {
      const transit = TRANSIT[place!];
      out.push({
        name: transit.go ?? s.name,
        from,
        to: from + go,
        clip: transit.clip,
        walk: { from: site, to: target },
      });
      // kroky na místě – podíly zbytku po cestě
      const stay = to - from - 2 * go;
      const inner = weights.slice(k, j).reduce((sum, w) => sum + w, 0);
      let u = from + go;
      for (let i = k; i < j; i++) {
        const st = steps[i]!;
        const v = i === j - 1 ? to - go : u + (weights[i]! / inner) * stay;
        out.push({ name: st.name, from: u, to: v, at: target, ...clipOf(st) });
        u = v;
      }
      out.push({
        name: transit.come,
        from: to - go,
        to,
        clip: 'walk',
        walk: { from: target, to: site },
      });
    } else if (!place) {
      out.push({ name: s.name, from, to, ...clipOf(s) });
    } else {
      // krok jinde se nevejde – práce úlohy na místě
      out.push({ name: 'work', from, to });
    }
    t = to;
    k = j;
  }
  return out;
}

function clipOf(s: PhaseStep): Pick<ActivityPhase, 'clip' | 'pace'> {
  return {
    ...(s.clip ? { clip: s.clip } : {}),
    ...(s.pace !== undefined ? { pace: s.pace } : {}),
  };
}

/** Fáze v okamžik `t` (poslední, která začala; před první první). */
export function phaseAt(phases: readonly ActivityPhase[], t: number): ActivityPhase {
  let found = phases[0]!;
  for (const p of phases) {
    if (p.from > t) break;
    found = p;
  }
  return found;
}

/** Jde postava ve fázi (cesta ode dveří, domů, ke kroku jinde a zpět)? */
export function phaseWalking(p: ActivityPhase): boolean {
  return p.name === 'out' || p.walk !== undefined || p.name === 'back' || p.name === 'bring-catch';
}

/**
 * Činnost, fáze a klip člověka v okamžik `t` (villagers.md – Pro implementaci, úloha 7): rozvrh
 * (`scheduleAt` – řetěz od `origin`), jeho fáze a klip, který postava v `t` hraje (doma `idle`).
 * Čistá funkce vstupu a času – stejný `t` = stejná fáze.
 */
export function schedulePhaseAt(
  input: ScheduleInput,
  personId: number,
  t: number,
  origin?: number,
): { activity: Activity; phase: ActivityPhase; clip: VillagerClip } {
  const activity = scheduleAt(input, personId, t, origin);
  const walkS = input.walkS
    ? (a: Point, b: Point): number => input.walkS!(a, b, personId)
    : undefined;
  const phases = activityPhases(activity, input.seed, walkS);
  const door = input.doorOf?.(personId) ?? activity.task?.at ?? { x: 0, z: 0 };
  const pose = activityPose(activity, door, undefined, phases)(t, [], createVillagerPose());
  return { activity, phase: phaseAt(phases, t), clip: pose.clip };
}
