// Jména mužů rodu (lord.md – Jména, Generovaná jména vnuků): seznam předkřesťanských slovanských
// mužských jmen (svět začíná roku 500) a deterministická volba jména vnukovi. Čisté funkce bez I/O.
import { createRandom, deriveSeed } from '../landscape/random';
import type { VillageState } from './types';

/**
 * Předkřesťanská slovanská mužská jména (lord.md – Generovaná jména vnuků; seznam z návrhu doplnila
 * implementace – návrh Clauda). Data domény – stejný seznam bere i kostka v panelu jména.
 */
export const LINE_NAMES: readonly string[] = [
  'Bohuslav',
  'Bolemír',
  'Boleslav',
  'Bořislav',
  'Bořivoj',
  'Branislav',
  'Budivoj',
  'Ctibor',
  'Čáslav',
  'Dalibor',
  'Dobromil',
  'Dobroslav',
  'Domaslav',
  'Drahomír',
  'Hněvsa',
  'Hostivít',
  'Hostivoj',
  'Chotěbor',
  'Jaromír',
  'Kazimír',
  'Kojata',
  'Křesomysl',
  'Lubomír',
  'Ludomír',
  'Lutobor',
  'Milhost',
  'Miroslav',
  'Mnata',
  'Mojmír',
  'Mstiboj',
  'Mstislav',
  'Myslibor',
  'Neklan',
  'Nezamysl',
  'Ostoj',
  'Přemysl',
  'Přibyslav',
  'Radim',
  'Radoslav',
  'Radslav',
  'Ratibor',
  'Rostislav',
  'Slavibor',
  'Slavoj',
  'Soběslav',
  'Spytihněv',
  'Strachkvas',
  'Svatobor',
  'Svatopluk',
  'Těšimír',
  'Unislav',
  'Velislav',
  'Vítoslav',
  'Vladimír',
  'Vlastislav',
  'Vnislav',
  'Vojen',
  'Vojtěch',
  'Vratislav',
  'Zbraslav',
  'Zbyhněv',
  'Zdeslav',
];

/** Jména, která nosí žijící muži rodu. */
function lineNamesTaken(state: Pick<VillageState, 'people'>): Set<string> {
  const taken = new Set<string>();
  for (const p of state.people) {
    if (p.line && p.sex === 'male' && p.name !== undefined) taken.add(p.name);
  }
  return taken;
}

/** Jméno ze seznamu losem `roll` ∈ [0, 1) – přednostně to, které není v `taken`. */
function pickName(roll: number, taken: ReadonlySet<string>): string {
  const free = LINE_NAMES.filter((n) => !taken.has(n));
  // vyčerpaný seznam (víc žijících mužů rodu než jmen) – libovolné ze seznamu
  const pool = free.length > 0 ? free : LINE_NAMES;
  return pool[Math.floor(roll * pool.length)] ?? LINE_NAMES[0] ?? '';
}

/**
 * Vygenerované jméno muže rodu `personId` narozeného (nebo převedeného) dne `day` (lord.md –
 * Generovaná jména vnuků): deterministicky z vlastního proudu vsi (`'line-name:' + day`, rozlišený
 * člověkem – víc vnuků téhož dne dostane každý svůj los). Jen jméno, které nenosí žádný žijící muž
 * rodu ve vsi – jména se v rodě vracejí po zemřelých dědech.
 */
export function generatedLineName(
  state: Pick<VillageState, 'people' | 'seed'>,
  day: number,
  personId: number,
): string {
  const random = createRandom(deriveSeed(state.seed, `line-name:${day}:${personId}`));
  return pickName(random.next(), lineNamesTaken(state));
}

/**
 * Jméno pro kostku v panelu jména (lord.md – Kde se jméno zadává): ze stejného seznamu, přednostně
 * jméno, které rod nenosí (`taken`). Deterministicky ze `seed`.
 */
export function suggestLineName(seed: number, taken: readonly string[]): string {
  return pickName(createRandom(seed).next(), new Set(taken));
}
