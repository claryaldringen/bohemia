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

/**
 * Nový výběr po kliknutí do scény: bez modifikátoru vybere, co je pod kurzorem (prázdná zem
 * výběr zruší) – u pole a sadu jen díl / čtverec pod kurzorem, dvojklik (`double`) celé pole či
 * sad (Martin 19. 10. 2026 – fields.md, Co hráč vidí); dvojklik na ostatní je jako klik. S Ctrl
 * / Shift (`additive`) přidá obydlí k vybraným obydlím, nebo ho z výběru ubere, když už vybrané
 * je; prázdná zem výběr nechá. Jiný cíl než obydlí (úsek cesty mezi domy, pole…) vybraná obydlí
 * nezruší – klik vedle domu výběr nerozbije; když obydlí vybraná nejsou, vybere se sám (víc
 * najednou jde vybrat jen obydlí).
 */
export function nextSelection(
  current: VillageTarget | null,
  clicked: VillageTarget | null,
  additive: boolean,
  double = false,
): VillageTarget | null {
  const picked = double && clicked !== null ? wholeTarget(clicked) : clicked;
  if (!additive) return picked;
  if (picked === null) return current;
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
    // zemřelý člověk (villagers.md – Výběr postavy)
    if (target.kind === 'person') return personExists(village, target.id) ? target : null;
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
