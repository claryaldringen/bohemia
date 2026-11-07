import type {
  CampaignPhase,
  CampaignView,
  CampaignViewAlly,
  CampaignViewBuilding,
  CampaignViewForeign,
  CampaignViewGroup,
  CampaignViewMan,
  Pos,
} from '@bohemia/game';

// Pohled na tažení pro prohlížeč (war.md – Mlha války; plán 2026-11-03 – Úloha 6.14): typy jsou
// z jádra (`domain/war/view.ts`), tady jen interpolace mezi dvěma dotazy – scéna i mapa tažení
// kreslí polohu mezi posledními dvěma stavy, server je počítá po taktech (4 za sekundu).

export type {
  CampaignView,
  CampaignViewAlly,
  CampaignViewBuilding,
  CampaignViewForeign,
  CampaignViewGroup,
  CampaignViewMan,
};

/** Běžící tažení hráče v panelu Vojsko. */
export interface CampaignSummary {
  id: string;
  targetName: string | null;
  phase: CampaignPhase;
  liveCommand: boolean;
}

/** Odpověď `GET /api/campaign/[id]` – pohled, nebo chyba (401 bez session, 404 cizí tažení). */
export type CampaignResponse = { view: CampaignView } | { error: string };

/** Dotaz na tažení 2× za sekundu (plán 2026-11-03 – Úloha 6.14). */
export const CAMPAIGN_POLL_MS = 500;

/** Jak často otevřené tažení hlásí přítomnost hráče – zástupce převezme po 1 herním dni (≈ 86 s). */
export const PRESENCE_EVERY_MS = 20_000;

const lerp = (a: Pos, b: Pos, t: number): Pos => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  a.x === b.x && a.y === b.y;

/**
 * Pohled mezi stavem `prev` a `next` v podílu `t` (0 = `prev`, 1 = `next`): polohy vlastních mužů,
 * spojenců, skupin a cizích v dohledu se posunou rovnoměrně; kdo v `prev` chybí nebo přešel na jinou
 * mapu, stojí rovnou v `next`. Ostatní údaje jsou z `next`.
 */
export function interpolateCampaign(
  prev: CampaignView | null,
  next: CampaignView,
  t: number,
): CampaignView {
  if (prev === null || prev.id !== next.id || t >= 1) return next;
  const k = Math.max(0, t);
  const men = new Map(prev.men.map((m) => [m.member, m]));
  const allies = new Map(prev.allies.map((m) => [m.member, m]));
  const groups = new Map(prev.groups.map((g) => [g.id, g]));
  const foreign = new Map(prev.foreign.map((f) => [f.id, f]));
  const move = <T extends { cell: { x: number; y: number }; pos: Pos }>(
    from: T | undefined,
    to: T,
  ): T => (from && sameCell(from.cell, to.cell) ? { ...to, pos: lerp(from.pos, to.pos, k) } : to);
  return {
    ...next,
    men: next.men.map((m) => move(men.get(m.member), m)),
    allies: next.allies.map((m) => move(allies.get(m.member), m)),
    groups: next.groups.map((g) => move(groups.get(g.id), g)),
    foreign: next.foreign.map((f) => {
      const from = foreign.get(f.id);
      return from ? { ...f, pos: lerp(from.pos, f.pos, k) } : f;
    }),
  };
}
