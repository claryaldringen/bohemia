import { cloneState } from './clone';
import { ageGroup, ageYears, laborPerDay } from './people';
import { CRAFT_SKILL } from './rules';
import { smithSons, type SmithMember } from './smith-supply';
import type { Craft, Person, VillageState } from './types';

// Učení řemesla (crafts.md – Učení řemesla; Martin 20. 10. 2026: „Každý řemeslník vychovává svého
// nástupce - syna. Pokud je řemeslník úplně nový, trvá mu, než se řemeslo naučí“; podrobnosti návrh
// Clauda). Praxe je u člověka v letech (`Person.practice`): dospělý z domácnosti dílny ji získává
// za dny, kdy dílna pracuje, syn řemeslníka se učí od 10 let – ve dny, kdy dílna pracuje, a u kováře
// i ve dny, kdy nosí uhlí od milíře. Výkon dílny jde podle nejzkušenějšího dospělého z domácnosti:
// 50 % bez praxe, 100 % po 5 letech. Syn, který dílnu převezme, je po letech učení vyučený; cizí
// rodina v dílně začíná od nuly. Kroky mutují stav (volat na klonu), den po dni, deterministicky.

const DAYS_PER_YEAR = 365;
/** Praxe za den práce v dílně (roky). */
const PRACTICE_PER_DAY = 1 / DAYS_PER_YEAR;

/** Výkon dílny při praxi `years` (roky): 50 % bez praxe, lineárně do 100 % po 5 letech. */
export function skillShare(years: number): number {
  const learned = Math.min(1, Math.max(0, years) / CRAFT_SKILL.fullYears);
  return CRAFT_SKILL.startShare + (1 - CRAFT_SKILL.startShare) * learned;
}

/** Praxe člověka v řemesle (roky); bez praxe 0. */
export function practiceOf(person: Pick<Person, 'practice'>, craft: Craft): number {
  return person.practice?.[craft] ?? 0;
}

/**
 * Výkon dílny `dwellingId` v den `day` 0,5–1 (crafts.md – Učení řemesla): podle praxe
 * nejzkušenějšího dospělého (od 14 let, i staršího – mistr radí) z domácnosti, který je doma
 * (`away` – na cestě pro kování, wagons.md). Dílna z doby před učením řemesla (`skillTracked`
 * chybí – do převodu) a obydlí bez dílny 1.
 */
export function workshopSkill(
  state: Pick<VillageState, 'dwellings' | 'people'>,
  dwellingId: number,
  day: number,
  away: number | null = null,
): number {
  const workshop = state.dwellings.find((d) => d.id === dwellingId)?.workshop;
  if (!workshop?.skillTracked) return 1;
  let best = 0;
  for (const p of state.people) {
    if (p.dwellingId !== dwellingId || p.id === away || ageGroup(p, day) === 'child') continue;
    best = Math.max(best, practiceOf(p, workshop.craft));
  }
  return skillShare(best);
}

/**
 * Učni dílny (crafts.md – Učení řemesla): synové řemeslníka (otec nebo matka v domácnosti dílny,
 * jako synové kováře – smith-supply.ts) od 10 let, od nejstaršího.
 */
export function craftApprentices(
  state: Pick<VillageState, 'people'>,
  dwellingId: number,
  day: number,
): SmithMember[] {
  return smithSons(state, dwellingId, day).filter((s) => s.age >= CRAFT_SKILL.apprenticeFromAge);
}

/** Učení řemesla v dílně pro panel výběru (crafts.md – Učení řemesla). */
export interface CraftSkillSummary {
  /** Výkon dílny podle praxe 0,5–1 (`workshopSkill`). */
  share: number;
  /** Praxe nejzkušenějšího dospělého z domácnosti (roky, nejvýš 5). */
  years: number;
  /** Synové řemeslníka od 10 let, kteří se ještě učí (praxe pod 5 let) – věk a praxe (roky). */
  apprentices: { age: number; years: number }[];
}

/**
 * Učení řemesla v dílně `dwellingId` (panel výběru): výkon, praxe řemeslníka a učni. Dílna z doby
 * před učením (do převodu) je vyučená a nikdo se v ní neučí.
 */
export function craftSkillSummary(
  state: Pick<VillageState, 'dwellings' | 'people'>,
  dwellingId: number,
  day: number,
  away: number | null = null,
): CraftSkillSummary {
  const workshop = state.dwellings.find((d) => d.id === dwellingId)?.workshop;
  if (!workshop?.skillTracked) {
    return { share: 1, years: CRAFT_SKILL.fullYears, apprentices: [] };
  }
  const craft = workshop.craft;
  let years = 0;
  for (const p of state.people) {
    if (p.dwellingId !== dwellingId || p.id === away || ageGroup(p, day) === 'child') continue;
    years = Math.max(years, practiceOf(p, craft));
  }
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const apprentices = craftApprentices(state, dwellingId, day).flatMap((s) => {
    const learned = practiceOf(byId.get(s.id)!, craft);
    return learned < CRAFT_SKILL.fullYears ? [{ age: s.age, years: learned }] : [];
  });
  return { share: skillShare(years), years, apprentices };
}

/** Přidá praxi `years` v řemesle (mutuje člověka), nejvýš do vyučení. */
function addPractice(person: Person, craft: Craft, years: number): void {
  const now = practiceOf(person, craft);
  if (now >= CRAFT_SKILL.fullYears) return;
  person.practice = { ...person.practice, [craft]: Math.min(CRAFT_SKILL.fullYears, now + years) };
}

/**
 * Den praxe v dílnách (mutuje stav – krok práce): v dílnách, které dnes pracovaly (`worked` – id
 * obydlí, ne `resting`), získá den praxe každý dospělý, který v dílně pracuje (14–44 let), a učni
 * (synové od 10 let); v kovárnách, kde dnes jen synové nosili uhlí od milíře (`apprenticesOnly` –
 * kovář pracoval se vsí), jen učni. Člověk na cestě (`away` – id) praxi nezíská. Dílny z doby
 * před učením řemesla (bez `skillTracked`) se přeskakují.
 */
export function gainPractice(
  state: VillageState,
  day: number,
  worked: { has(id: number): boolean },
  apprenticesOnly: { has(id: number): boolean } = new Set<number>(),
  away: { has(id: number): boolean } = new Set<number>(),
): void {
  for (const d of state.dwellings) {
    const workshop = d.workshop;
    if (!workshop?.skillTracked) continue;
    const full = worked.has(d.id);
    if (!full && !apprenticesOnly.has(d.id)) continue;
    const learners = new Set(craftApprentices(state, d.id, day).map((s) => s.id));
    for (const p of state.people) {
      if (p.dwellingId !== d.id || away.has(p.id)) continue;
      if (learners.has(p.id) || (full && laborPerDay(p, day) > 0)) {
        addPractice(p, workshop.craft, PRACTICE_PER_DAY);
      }
    }
  }
}

/**
 * Jak dlouho drží domácnost dílnu `dwellingId` (roky k `day`) podle kroniky: od dostavění dílny
 * nebo od nastěhování domácnosti (co je později); bez záznamu (dílna starší než kronika) null.
 */
function heldYears(state: VillageState, dwellingId: number, day: number): number | null {
  let since: number | null = null;
  for (const e of state.chronicle) {
    const founded =
      (e.kind === 'construction-finished' && e.dwellingId === dwellingId && e.craft) ||
      (e.kind === 'household-founded' && e.dwellingId === dwellingId);
    if (founded && (since === null || e.day > since)) since = e.day;
  }
  return since === null ? null : Math.max(0, day - since) / DAYS_PER_YEAR;
}

/**
 * Převod vsi z doby před učením řemesla (crafts.md – Učení řemesla, Starší vsi; jednou,
 * idempotentně – jinak vrací týž objekt): dnešní řemeslníci jsou vyučení. Každá dílna bez
 * `skillTracked` ho dostane a její lidé praxi – dospělí a synové řemeslníka od 10 let tolik let,
 * kolik domácnost dílnu drží (kronika – dostavění, nastěhování; starší než kronika 5 let), nejvýš
 * kolik let jim je přes 10. Tesař z dílny dostavěné před půl rokem má tak půl roku praxe, kovář
 * po desítkách let je vyučený. Ves bez dílen beze změny.
 */
export function withCraftSkill(state: VillageState): VillageState {
  if (!state.dwellings.some((d) => d.workshop && !d.workshop.skillTracked)) return state;
  const next = cloneState(state);
  const day = next.lastDay;
  for (const d of next.dwellings) {
    const workshop = d.workshop;
    if (!workshop || workshop.skillTracked) continue;
    workshop.skillTracked = true;
    const years = heldYears(next, d.id, day) ?? CRAFT_SKILL.fullYears;
    const sons = new Set(craftApprentices(next, d.id, day).map((s) => s.id));
    for (const p of next.people) {
      if (p.dwellingId !== d.id) continue;
      if (ageGroup(p, day) === 'child' && !sons.has(p.id)) continue;
      const learned = ageYears(p.bornDay, day) - CRAFT_SKILL.apprenticeFromAge;
      const practice = Math.min(CRAFT_SKILL.fullYears, years, Math.max(0, learned));
      if (practice > practiceOf(p, workshop.craft)) {
        p.practice = { ...p.practice, [workshop.craft]: practice };
      }
    }
  }
  return next;
}
