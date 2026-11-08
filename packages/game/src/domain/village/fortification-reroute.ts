import type { Landscape, ObstacleLayer } from '../landscape';
import { cloneState } from './clone';
import { busySegments, rerouteFortification, sectionOf } from './fortification';
import { startSectionUpgrade } from './fortification-upgrade';
import {
  FORT_BUSY,
  FORT_UNKNOWN,
  villageFortifications,
  type FortificationResult,
} from './fortifications';
import type { VillageEventBody } from './inbox';
import type { Walk } from './paths/walking';
import type { Point } from './polygon';
import { raidHiding } from './raid-day';
import type { VillageState, WallKind } from './types';

// Nový úsek od brány k bráně – i jinudy (demolition.md – Rozhodnutí; Martin 8. 11. 2026: „Můžu
// postavit jen část té zdi od brány k bráně. Hráč bude bourat, pokud zjistí, že potřebuje vést
// část hradby jinudy.“). V mezeře po zbořeném úseku hráč postaví novou část hradby po nové trase
// z bodů – konce drží brány. Tvar nového obvodu je `rerouteFortification`, stavba je vylepšení
// mezery na cílovou hradbu (`startSectionUpgrade`) – cena a práce podle délky nového úseku a druhu
// (návrh Clauda).

/**
 * U vsi se bojuje – úsek jinudy počká (návrh Clauda): nový tvar přečísluje díly, a bitva i zpráva
 * o průlomu ve schránce (`fortification-breach`) nesou čísla dílů starého tvaru.
 */
export const FORT_UNDER_ATTACK = 'U hradby se bojuje – teď ji nejde přestavět.';

/**
 * Nese nedoručená událost schránky boj u vsi – průlom s čísly dílů opevnění, den cizího vojska na
 * mapě vsi nebo výsledek nájezdu (průlom jde s ním)? Pak úsek jinudy počká (`FORT_UNDER_ATTACK`).
 */
export function contestsFortification(body: Pick<VillageEventBody, 'kind'>): boolean {
  return (
    body.kind === 'fortification-breach' || body.kind === 'raid-day' || body.kind === 'raid-result'
  );
}

/** Vstup stavby úseku jinudy – díl ve zbořeném úseku, body nové trasy a cílová hradba. */
export interface SectionRerouteInput {
  fortificationId: number;
  /** Díl (`FortSegment.index`) ve zbořeném úseku – úsek dohledá server (`sectionOf`). */
  segment: number;
  /**
   * Body nové trasy od brány na začátku úseku (po směru hodin) po bránu na jeho konci, bez konců
   * – ty drží brány.
   */
  points: readonly Point[];
  /** Hradba nového úseku (palisáda s ochozem ne – jen vylepšením palisády). */
  target: WallKind;
  /**
   * U vsi se bojuje podle světa mimo stav vsi (use-case): ve schránce čeká nedoručená zpráva boje
   * (`contestsFortification`), nebo proti vsi běží tažení. Chybí = ne.
   */
  contested?: boolean;
}

/**
 * Hráč postaví zbořený úsek mezi branami jinudy (demolition.md – Rozhodnutí): jen úsek celý zbořený
 * (`FORT_SECTION_STANDS`) a jen když na opevnění nic neběží – nový tvar přečísluje díly, rozdělaná
 * stavba by držela staré (`FORT_BUSY`; návrh Clauda) – ani u vsi se nesmí bojovat (cizí vojsko
 * dnes na mapě vsi, `input.contested` z use-casu – `FORT_UNDER_ATTACK`). Nový obvod se nesmí křížit, obejít opevnění
 * ani zmenšit pod nejmenší plochu (`rerouteFortification`); ohyb cílové hradby, pás, rok, dřevo
 * a kámen kontroluje stavba úseku (`startSectionUpgrade` – díly nového úseku jsou mezera, staví se
 * za cenu nové hradby). Zrušená stavba nechá novou trasu jako mezeru. Vstupní stav nemění.
 */
export function startSectionReroute(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  input: SectionRerouteInput,
  walk?: Walk,
): FortificationResult {
  const fort = villageFortifications(state).find((f) => f.id === input.fortificationId);
  if (!fort) return { ok: false, reason: FORT_UNKNOWN };
  // bitva a zpráva o průlomu drží čísla dílů starého tvaru; cizí vojsko dnes na mapě vsi
  if (input.contested === true || raidHiding(state, day)) {
    return { ok: false, reason: FORT_UNDER_ATTACK };
  }
  const section = sectionOf(fort, input.segment);
  if (!section) return { ok: false, reason: FORT_UNKNOWN };
  const busy = busySegments(
    state.constructions,
    fort.id,
    fort.segments.map((s) => s.index),
  );
  if (busy.size > 0) return { ok: false, reason: FORT_BUSY };
  const rerouted = rerouteFortification(fort, landscape, section, input.points, day);
  if ('reason' in rerouted) return { ok: false, reason: rerouted.reason };
  const next = cloneState(state);
  next.fortifications = villageFortifications(next).map((f) =>
    f.id === fort.id ? rerouted.fort : f,
  );
  return startSectionUpgrade(
    next,
    day,
    landscape,
    obstacles,
    { fortificationId: fort.id, segment: rerouted.gateSegment, target: input.target },
    walk,
  );
}
