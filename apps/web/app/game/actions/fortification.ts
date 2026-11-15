'use server';

import {
  placeFortificationForPlayer,
  upgradeFortificationForPlayer,
  addFortificationGateForPlayer,
  demolishFortificationSectionForPlayer,
  demolishFortificationGateForPlayer,
  abandonFortificationGateForPlayer,
  rerouteFortificationSectionForPlayer,
  fillFortificationGateGapForPlayer,
  addFortificationRampartForPlayer,
  fillFortificationMoatForPlayer,
  upgradeFortificationGateForPlayer,
  type VillageActionResult,
} from '@/lib/village';
import {
  parsePlaceFortificationInput,
  parseUpgradeFortificationInput,
  parseAddFortificationGateInput,
  parseDemolishFortificationSectionInput,
  parseAbandonFortificationGateInput,
  parseRerouteFortificationSectionInput,
  parseFillFortificationGateGapInput,
  parseFortificationRampartInput,
  parseFortificationGateUpgradeInput,
} from '@/lib/village-input';
import { villageAction } from './_shared';

/**
 * Stavba opevnění (fortifications.md – Obvod, Cena a stavba): `{ villageId, cells: [{ x, y }],
 * kind: 'fence' | 'palisade' | 'rampart', grid? }`. Server umístění ověří znovu
 * (`checkFortificationPlacement`).
 */
export async function placeFortification(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceFortificationInput, placeFortificationForPlayer);
}

/**
 * Vylepšení opevnění (fortifications.md – Druhy): `{ villageId, fortificationId, work: 'upgrade' }`
 * (plot na palisádu), nebo `{ …, work: 'top', top: 'fence' | 'palisade' }` (nástavba na valu).
 */
export async function upgradeFortification(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseUpgradeFortificationInput, upgradeFortificationForPlayer);
}

/**
 * Brána opevnění (fortifications.md – Brány): `{ villageId, fortificationId, position: { x, z } }`
 * – klik na obvod ve světě.
 */
export async function addFortificationGate(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseAddFortificationGateInput, addFortificationGateForPlayer);
}

/**
 * Zboření úseku opevnění mezi branami (demolition.md – Opevnění): `{ villageId, fortificationId,
 * segment }` – díl, na který hráč klikl; úsek dohledá server.
 */
export async function demolishFortificationSection(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseDemolishFortificationSectionInput,
    demolishFortificationSectionForPlayer,
  );
}

/**
 * Zboření brány (demolition.md – Rozhodnutí): `{ villageId, fortificationId, segment }` – díl
 * s branou; zbyde mezera.
 */
export async function demolishFortificationGate(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseDemolishFortificationSectionInput,
    demolishFortificationGateForPlayer,
  );
}

/**
 * Opustit / Vrátit bránu (demolition.md – Rozhodnutí): `{ villageId, fortificationId, segment,
 * abandoned }`.
 */
export async function abandonFortificationGate(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseAbandonFortificationGateInput,
    abandonFortificationGateForPlayer,
  );
}

/**
 * Úsek od brány k bráně jinudy (demolition.md – Rozhodnutí): `{ villageId, fortificationId,
 * segment, points, target }` – díl ve zbořeném úseku, body nové trasy mezi branami a hradba.
 */
export async function rerouteFortificationSection(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseRerouteFortificationSectionInput,
    rerouteFortificationSectionForPlayer,
  );
}

/**
 * Otvor po zbořené bráně zastavit hradbou (D45): `{ villageId, fortificationId, segment, target }`
 * – díl zbořené brány a druh z rozcestníku opevnění.
 */
export async function fillFortificationGateGap(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseFillFortificationGateGapInput,
    fillFortificationGateGapForPlayer,
  );
}

/**
 * Doplnění valu s příkopem pod stojící hradbu (fortifications.md – Hradby a obrana, Druhy):
 * `{ villageId, fortificationId, segment }` – díl úseku, null celé opevnění.
 */
export async function addFortificationRampart(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseFortificationRampartInput, addFortificationRampartForPlayer);
}

/** Napuštění příkopu úseku: `{ villageId, fortificationId, segment }` (Hradby a obrana, Druhy). */
export async function fillFortificationMoat(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseDemolishFortificationSectionInput,
    fillFortificationMoatForPlayer,
  );
}

/**
 * Klešťová brána nebo věž nad branou (fortifications.md – Hradby a obrana, Brány): `{ villageId,
 * fortificationId, segment, level: 'pincer' | 'tower' }`.
 */
export async function upgradeFortificationGate(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseFortificationGateUpgradeInput,
    upgradeFortificationGateForPlayer,
  );
}
