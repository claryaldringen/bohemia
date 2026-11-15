import { roadChainIds } from '@bohemia/game';
import type { SceneVillage, VillageRoad } from '../village-view';
import {
  personExists,
  selectedFieldPart,
  targetExists,
  selectedOrchardSquare,
  wholeTarget,
  type VillageTarget,
} from './village-picking';

// Výběr víc obydlí (migration.md – Výběr víc obydlí; jako v 0 A.D.): Ctrl / Shift + klik přidá
// nebo ubere obydlí z výběru, Ctrl + A vybere všechna hotová obydlí vsi. Čisté funkce bez
// Babylonu.

/** Id vybraných obydlí – jedno, víc, nebo žádné (vybrané je něco jiného). */
export function selectedDwellingIds(target: VillageTarget | null): readonly number[] {
  if (target?.kind === 'dwelling') return [target.id];
  if (target?.kind === 'dwellings') return target.ids;
  return [];
}

/** Výběr z id obydlí: žádné → nic, jedno → obydlí, víc → víc obydlí. */
export function dwellingsTarget(ids: readonly number[]): VillageTarget | null {
  const [first] = ids;
  if (first === undefined) return null;
  return ids.length === 1 ? { kind: 'dwelling', id: first } : { kind: 'dwellings', ids };
}

/** Id vybraných lidí – jeden, víc, nebo žádný (vybrané je něco jiného). */
export function selectedPeopleIds(target: VillageTarget | null): readonly number[] {
  if (target?.kind === 'person') return [target.id];
  if (target?.kind === 'people') return target.ids;
  return [];
}

/**
 * Domovská ves vybraných lidí, není-li to ves scény (`villageId` výběru – id osoby je jedinečné jen
 * ve vsi); lidé vsi scény, nebo vybrané není nikdo – undefined.
 */
export function selectedPeopleVillage(target: VillageTarget | null): string | undefined {
  return target?.kind === 'person' || target?.kind === 'people' ? target.villageId : undefined;
}

/**
 * Výběr z id lidí vsi `villageId` (chybí – ves scény): nikdo → nic, jeden → člověk, víc → víc lidí.
 */
export function peopleTarget(ids: readonly number[], villageId?: string): VillageTarget | null {
  const [first] = ids;
  if (first === undefined) return null;
  const village = villageId === undefined ? {} : { villageId };
  return ids.length === 1
    ? { kind: 'person', id: first, ...village }
    : { kind: 'people', ids, ...village };
}

/**
 * Skupina člověka `personId` vsi `villageId` (chybí – ves scény) venku – id lidí skupiny, i jeho;
 * člověk mimo skupinu → null.
 */
export type PartyOf = (personId: number, villageId: string | undefined) => readonly number[] | null;

/**
 * Klik na člověka (expeditions.md – Výběr a skupina; jako jednotky v 0 A.D.): bez modifikátoru
 * vybere člověka, člena skupiny venku celou skupinu; s Ctrl / Shift (`additive`) člověka přidá
 * nebo ubere, u člena skupiny celou skupinu. Člověk jiné domovské vsi (`villageId` výběru) výběr
 * nahradí, obydlí a lidé se nemíchají (člověk k obydlím výběr nahradí).
 */
function nextPeopleSelection(
  current: VillageTarget | null,
  clicked: Extract<VillageTarget, { kind: 'person' }>,
  additive: boolean,
  partyOf: PartyOf | undefined,
): VillageTarget | null {
  const village = clicked.villageId;
  const party = partyOf?.(clicked.id, village) ?? null;
  const group = party && party.length > 0 ? party : [clicked.id];
  const ids = selectedPeopleIds(current);
  if (!additive || ids.length === 0) return peopleTarget(group, village);
  if (selectedPeopleVillage(current) !== village) return peopleTarget(group, village);
  const allIn = group.every((id) => ids.includes(id));
  return allIn
    ? peopleTarget(
        ids.filter((id) => !group.includes(id)),
        village,
      )
    : peopleTarget([...ids, ...group.filter((id) => !ids.includes(id))], village);
}

/**
 * Nový výběr po kliknutí do scény: bez modifikátoru vybere, co je pod kurzorem (prázdná zem
 * výběr zruší) – u pole a sadu jen díl / čtverec pod kurzorem, dvojklik (`double`) celé pole či
 * sad (Martin 19. 10. 2026 – fields.md, Co hráč vidí); dvojklik na ostatní je jako klik. S Ctrl
 * / Shift (`additive`) přidá obydlí k vybraným obydlím, nebo ho z výběru ubere, když už vybrané
 * je; prázdná zem výběr nechá. Jiný cíl než obydlí (úsek cesty mezi domy, pole…) vybraná obydlí
 * nezruší – klik vedle domu výběr nerozbije; když obydlí vybraná nejsou, vybere se sám (víc
 * najednou jde vybrat jen obydlí a lidi – ti přes `partyOf`).
 */
export function nextSelection(
  current: VillageTarget | null,
  clicked: VillageTarget | null,
  additive: boolean,
  double = false,
  partyOf?: PartyOf,
): VillageTarget | null {
  if (clicked?.kind === 'person') {
    return nextPeopleSelection(current, clicked, additive, partyOf);
  }
  const picked = double && clicked !== null ? wholeTarget(clicked) : clicked;
  if (!additive) return picked;
  if (picked === null) return current;
  // lidé vybraní → jiný cíl s Shiftem výběr lidí nezruší
  if (selectedPeopleIds(current).length > 0) return current;
  const ids = selectedDwellingIds(current);
  if (picked.kind !== 'dwelling') return ids.length > 0 ? current : picked;
  return ids.includes(picked.id)
    ? dwellingsTarget(ids.filter((id) => id !== picked.id))
    : dwellingsTarget([...ids, picked.id]);
}

/** Všechna hotová obydlí vsi (Ctrl + A) – staveniště ne, ještě v nich nikdo nebydlí. */
export function allDwellingsTarget(village: SceneVillage): VillageTarget | null {
  return dwellingsTarget(village.dwellings.filter((d) => d.built).map((d) => d.id));
}

/**
 * Id hotového obydlí, které stojí na místě dostavěného staveniště `id` (jinak null): staveniště
 * bylo v `previous` (ne bourání), v `next` už není a v `next` je na jeho poloze hotové obydlí
 * stejného typu a řemesla.
 */
function builtFrom(previous: SceneVillage, next: SceneVillage, id: number): number | null {
  const site = previous.dwellings.find((d) => d.id === id);
  if (!site || site.built || site.demolition !== undefined) return null;
  if (next.dwellings.some((d) => d.id === id)) return null;
  const { x, z } = site.position;
  const done = next.dwellings.find(
    (d) =>
      d.built &&
      d.type === site.type &&
      d.craft === site.craft &&
      d.position.x === x &&
      d.position.z === z,
  );
  return done?.id ?? null;
}

/**
 * Dostavěné staveniště (jako v 0 A.D. – výběr přejde ze základů na hotovou budovu; návrh Clauda,
 * web-ui.md – Výběr): staveniště obydlí, řemeslné dílny i přestavby na novém pozemku je ve scéně
 * pod id stavby, hotová stavba pod id obydlí (stavba 6 → obydlí 1). Vybrané staveniště, které
 * mezi obnovenými stavy vsi `previous` → `next` zmizelo a na jeho místě stojí hotové obydlí
 * stejného druhu, se vymění za to obydlí (i ve výběru víc obydlí). Nic k výměně → null.
 * Modla, svatyně, humno a ohrada si id stavby nechají – výběr na ně trvá sám.
 */
export function followConstruction(
  previous: SceneVillage,
  next: SceneVillage,
  target: VillageTarget,
): VillageTarget | null {
  if (target.kind === 'dwelling') {
    const id = builtFrom(previous, next, target.id);
    return id === null ? null : { kind: 'dwelling', id };
  }
  if (target.kind !== 'dwellings') return null;
  const ids = target.ids.map((id) => builtFrom(previous, next, id) ?? id);
  if (ids.every((id, k) => id === target.ids[k])) return null;
  return dwellingsTarget([...new Set(ids)]);
}

/**
 * Bouraná stavba ve scéně zmizí a nahradí ji staveniště pod id stavby bourání (demolition-view.ts)
 * – vybraný dům, humno, modla či svatyně tak po pokynu Zbourat zůstane vybraný jako staveniště
 * bourání (panel ukáže průběh a Zrušit). Jiný cíl, nebo stavba, která ve vsi ještě je, → null.
 */
export function followDemolition(
  village: SceneVillage,
  target: VillageTarget,
): VillageTarget | null {
  const kinds = {
    dwelling: ['dwelling'],
    'threshing-floor': ['threshing-floor'],
    sacred: ['idol', 'shrine'],
  } as const;
  if (target.kind !== 'dwelling' && target.kind !== 'threshing-floor' && target.kind !== 'sacred') {
    return null;
  }
  if (targetExists(village, target)) return null;
  const structures: readonly string[] = kinds[target.kind];
  const site = (village.demolitions ?? []).find(
    (d) => d.targetId === target.id && structures.includes(d.structure),
  );
  return site ? { kind: target.kind, id: site.id } : null;
}

/**
 * Vybraný cíl, jak ho ves po obnovení stavu ještě má: zaniklé obydlí, díl pole (zarostl lesem,
 * ustoupil stavbě) či čtverec sadu → null, z víc obydlí zbydou jen existující (jedno zbylé je
 * obydlí). Beze změny vrátí tentýž objekt.
 */
export function presentTarget(
  village: SceneVillage,
  target: VillageTarget | null,
): VillageTarget | null {
  if (target === null) return null;
  const moved = followDemolition(village, target);
  if (moved) return moved;
  if (target.kind !== 'dwellings') {
    // zaniklá pole z výběru všech polí vypadnou, jedno zbylé je pole
    if (target.kind === 'fields') {
      const ids = target.ids.filter((id) => village.fields.some((f) => f.id === id));
      if (ids.length === target.ids.length) return target;
      const [only] = ids;
      if (only === undefined) return null;
      return ids.length === 1 ? { kind: 'field', id: only } : { kind: 'fields', ids };
    }
    if (target.kind === 'dwelling') {
      return village.dwellings.some((d) => d.id === target.id) ? target : null;
    }
    if (target.kind === 'field-part') {
      return selectedFieldPart(village, target) ? target : null;
    }
    if (target.kind === 'orchard-square') {
      return selectedOrchardSquare(village, target) ? target : null;
    }
    // lidé jiné vsi hráče (`villageId` – člen její výpravy) ve vsi scény nejsou – výběr zůstane
    if ((target.kind === 'person' || target.kind === 'people') && target.villageId) return target;
    // zemřelý člověk (villagers.md – Výběr postavy)
    if (target.kind === 'person') return personExists(village, target.id) ? target : null;
    // víc lidí: zemřelí z výběru vypadnou
    if (target.kind === 'people') {
      const ids = target.ids.filter((id) => personExists(village, id));
      return ids.length === target.ids.length ? target : peopleTarget(ids);
    }
    // spřežení, když se dnes neorá; vůz, který ves už nemá (doslouží)
    if (target.kind === 'plough-team' || target.kind === 'cart') {
      return targetExists(village, target) ? target : null;
    }
    return target;
  }
  const ids = target.ids.filter((id) => village.dwellings.some((d) => d.id === id));
  return ids.length === target.ids.length ? target : dwellingsTarget(ids);
}

/** Je klávesa výběr všech obydlí (Ctrl + A, na Macu i Cmd + A)? */
export function selectsAllDwellings(event: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    event.code === 'KeyA' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
  );
}

/**
 * Výpis výběru do konzole prohlížeče – typ a id objektu, ať Martin může říct, který objekt zlobí
 * (Martin 24. 10. 2026). U cesty všechny úseky řetězu, úsek pod kurzorem a oba konce cesty
 * z pohledu na ves (`VillageRoad.ends` – Martin 25. 10. 2026), např. `… – od dwelling 12 do
 * junction 565`.
 */
export function describeTarget(
  target: VillageTarget,
  village: Pick<SceneVillage, 'roads'>,
  views: readonly Pick<VillageRoad, 'segments' | 'ends'>[] = [],
): string {
  if (target.kind === 'road') {
    const chain = roadChainIds(village.roads ?? [], target.segment ?? target.id);
    const clicked = target.segment === undefined ? '' : `, kliknutý úsek ${target.segment}`;
    const view = views.find((v) => v.segments.includes(target.segment ?? target.id));
    const ends = view ? ` – od ${view.ends[0].log} do ${view.ends[1].log}` : '';
    return `road ${target.id} – úseky ${chain.join(', ')}${clicked}${ends}`;
  }
  const { kind, ...rest } = target;
  return `${kind} ${JSON.stringify(rest)}`;
}
