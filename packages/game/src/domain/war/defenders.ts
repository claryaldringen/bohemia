import { isLineMan, lineMen } from '../village/dynasty';
import { villageHappiness } from '../village/happiness';
import { ageYears, isAway, isInjured } from '../village/people';
import { AGE } from '../village/rules';
import type { Dwelling, VillageState } from '../village/types';
import type { Fighter } from './battle';
import type { Pos } from './march-grid';
import {
  canAttack,
  controlledPlan,
  dist2,
  nearest,
  returnTo,
  type FighterPlan,
  type PlanContext,
} from './orders';
import { WAR } from './rules-war';
import { lineManStrength, villagerStrength } from './strength';

// Obránci vsi (war.md – Boj – Dům od domu, Síla; Ztráty – Poslední muž rodu doma): kdo ves brání,
// jakou silou a u kterého domu. Domy blíž než 40 m od sebe tvoří skupinu domů – její obránci se
// seběhnou a brání společně. Úloha 6.8 zná jen výchozí postoj – obránci u domů; postoje vsi
// (stěna štítů, bílá vlajka, útěk do lesa), včasný útěk a skryté jámy doplní Ú6.9.

/** Obránce vsi – člověk, jeho dům a síla v boji. */
export interface Defender {
  personId: number;
  /** Dům, u kterého brání (poloha obydlí ve světě mapy). */
  pos: Pos;
  /** Skupina domů (`houseGroups`). */
  houseGroup: number;
  strength: number;
  /** Muž rodu – bojuje i lukem (war.md – Boj: luk mají jen muži rodu). */
  line: boolean;
  bow: boolean;
  /** Ženy, starší a chlapci 14–15 let brání jen svůj dům. */
  atHouseOnly: boolean;
  /** Poslední muž rodu doma – neklesne pod 10 zdraví, nevzdá se a vždy uteče. */
  lastLine: boolean;
}

/** Volby soupisu obránců. */
export interface RosterOptions {
  /**
   * Muži rodu po meči v jiných vsích hráče (lord.md – Konec rodu). Výchozí 0 – soupis zná jen tuto
   * ves, a tak je posledním každý jediný muž rodu ve vsi (ochrana spícího hráče má přednost).
   */
  lineMenElsewhere?: number;
}

/**
 * Skupiny domů (war.md – Dům od domu): obydlí blíž než 40 m od sebe patří do jedné skupiny
 * (i řetězem přes sousedy). Číslo skupiny = pořadí podle nejmenšího id obydlí; mapa id → skupina.
 */
export function houseGroups(
  dwellings: readonly Pick<Dwelling, 'id' | 'position'>[],
): Map<number, number> {
  const sorted = [...dwellings].sort((a, b) => a.id - b.id);
  const parent = sorted.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const near = WAR.houseGroupM * WAR.houseGroupM;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (dist2(sorted[i]!.position, sorted[j]!.position) >= near) continue;
      const a = root(i);
      const b = root(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const index = new Map<number, number>();
  const groups = new Map<number, number>();
  sorted.forEach((d, i) => {
    const r = root(i);
    if (!index.has(r)) index.set(r, index.size);
    groups.set(d.id, index.get(r)!);
  });
  return groups;
}

/**
 * Soupis obránců vsi v den `day` (war.md – Síla; návrh Clauda): muži 16–44 let silou vesničana
 * (0,4 × štěstí), muži rodu od 14 let podle zkušenosti a s lukem, ženy, starší a chlapci 14–15 let
 * 0,1 jen u svého domu. Kdo je pryč na čas nebo zraněný, nebrání. Pořadí podle id člověka.
 */
export function defenderRoster(
  state: VillageState,
  day: number,
  options: RosterOptions = {},
): Defender[] {
  const groups = houseGroups(state.dwellings);
  const homes = new Map(state.dwellings.map((d) => [d.id, d]));
  const fallback = state.dwellings[0];
  const villager = villagerStrength(false, villageHappiness(state));
  const lastLine = lineMen(state).length + (options.lineMenElsewhere ?? 0) === 1;
  const { boyFrom, manFrom } = WAR.defenderAges;
  const roster: Defender[] = [];
  for (const p of [...state.people].sort((a, b) => a.id - b.id)) {
    const age = ageYears(p.bornDay, day);
    if (age < boyFrom || isAway(p, day)) continue;
    if (isInjured(p, day)) continue;
    const home = homes.get(p.dwellingId) ?? fallback;
    const pos = home ? { x: home.position.x, z: home.position.z } : { x: 0, z: 0 };
    const houseGroup = home ? (groups.get(home.id) ?? 0) : 0;
    const line = isLineMan(p);
    const man = p.sex === 'male' && age >= manFrom && age < AGE.elder;
    const strength = line ? lineManStrength(p, null) : man ? villager : WAR.strength.defenderOther;
    roster.push({
      personId: p.id,
      pos,
      houseGroup,
      strength,
      line,
      bow: line,
      atHouseOnly: !line && !man,
      lastLine: line && lastLine,
    });
  }
  return roster;
}

/**
 * Plán obránce ve výchozím postoji – u domů (war.md – Dům od domu): muž napadne útočníka, kterého
 * vidí u domů své skupiny (do 40 m od některého) nebo který útočí na něj, a od domů skupiny se
 * nevzdálí víc než 40 m; ženy, starší a chlapci brání jen svůj dům – útočníka na dosah. Prchající
 * útočníky obránci nehoní. Hráčem řízený obránce (Ú6.14) jde podle hráče.
 */
export function defenderPlan(f: Fighter, ctx: PlanContext): FighterPlan {
  if (f.controlled) return controlledPlan(f, ctx);
  if (f.atHouseOnly) {
    const reach = WAR.combat.meleeM;
    const foes = ctx.fighters.filter(
      (e) => canAttack(f, e, false) && dist2(f.pos, e.pos) <= reach * reach,
    );
    return {
      target: nearest(f.pos, foes),
      moveTo: returnTo(f, f.home),
      leash: { at: [f.home], radiusM: 1 },
    };
  }
  const houses = ctx.houses(f.group);
  const zone = WAR.houseGroupM * WAR.houseGroupM;
  const foes = ctx.fighters.filter(
    (e) =>
      canAttack(f, e, false) &&
      ctx.sees(f.pos, e.pos) &&
      (e.aim === f.id || houses.some((h) => dist2(h, e.pos) <= zone)),
  );
  const foe = nearest(f.pos, foes);
  const leash = { at: houses, radiusM: WAR.houseGroupM };
  if (foe) return { target: foe, moveTo: null, leash };
  return { target: null, moveTo: returnTo(f, f.home), leash };
}
