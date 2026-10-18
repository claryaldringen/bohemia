// Ohrady a spřežení ve vsi bez Babylonu (docs/design/oxen.md): z dat vsi pro scénu, které
// ohrady se kreslí (čtverec, průběh stavby, branka ke vsi), jaká zvířata v nich stojí (voli
// spřežení – ne v den orby –, telata ve výcviku, krávy v zimě) a kde dnes orá spřežení (čelo
// orby z rozdělení práce dne). Kreslí village-renderer.ts (pen-renderer.ts, pen-animals.ts,
// plough-team-renderer.ts).
import type { SceneVillage } from '../village-view';
import { rowDirection } from './field-cells';
import { penFacing, type PenHerd } from './pen-layout';
import type { PenView } from './pen-renderer';
import type { PloughField } from './plough-team';

/** Řad orby na čtverci pole (15 m – řady po 2,5 m). */
export const PLOUGH_ROWS = 6;

/** Spřežení dnes orá – rozdělení práce dne má orbu. */
export function ploughingToday(village: Pick<SceneVillage, 'labor'>): boolean {
  return (village.labor?.shares ?? []).some((s) => s.activity === 'plough' && s.manDays > 0);
}

/**
 * Ohrady ke kreslení: čtverec, branka k nejbližšímu obydlí (bez obydlí dolů, −z), průběh stavby
 * (hotová 1) a stav opuštěné ohrady (abandonment.md – rozpad).
 */
export function scenePenViews(village: Pick<SceneVillage, 'pens' | 'dwellings'>): PenView[] {
  return (village.pens ?? []).map((pen) => {
    const square = { x: pen.x, z: pen.z, size: pen.size };
    let target: { x: number; z: number } = { x: pen.x, z: pen.z - 1 };
    let best = Infinity;
    for (const d of village.dwellings) {
      const distance = Math.hypot(d.position.x - pen.x, d.position.z - pen.z);
      if (distance < best) {
        best = distance;
        target = d.position;
      }
    }
    return {
      id: pen.id,
      square,
      facing: penFacing(square, target),
      progress: pen.built ? 1 : Math.min(0.999, Math.max(0, pen.progress)),
      ...(pen.condition === undefined ? {} : { condition: pen.condition }),
    };
  });
}

/**
 * Zvířata ohrad podle id: voli spřežení (v den orby jsou na poli), telata ve výcviku a krávy
 * stáda (v zimě – oxen.md). Nedostavěná ohrada žádná.
 */
export function penHerds(village: Pick<SceneVillage, 'pens' | 'labor'>): Map<number, PenHerd> {
  const out = ploughingToday(village);
  const herds = new Map<number, PenHerd>();
  for (const pen of village.pens ?? []) {
    if (!pen.built) continue;
    herds.set(pen.id, { oxen: out ? 0 : pen.oxen, trainees: pen.trainees, cows: pen.cows });
  }
  return herds;
}

/**
 * Kde dnes orá spřežení: první díl čela orby (`parts` podílu orby) – každé spřežení na jiném
 * dílu, kolik je spřežení (ohrady s voly), nejméně jedno. Řady podél delší strany pole jako
 * obtisk a postavy (field-cells.ts – `rowDirection`).
 */
export function ploughFields(
  village: Pick<SceneVillage, 'labor' | 'fields' | 'pens'>,
): PloughField[] {
  const shares = (village.labor?.shares ?? []).filter(
    (s) => s.activity === 'plough' && s.manDays > 0 && s.target.kind === 'field',
  );
  if (shares.length === 0) return [];
  const teams = Math.max(1, (village.pens ?? []).filter((p) => p.oxen > 0).length);
  const used = new Set<number>();
  const fields: PloughField[] = [];
  // nejdřív první díl každého podílu (plodina, pole), pak další díly čela
  const queues = shares.map((s) => [...(s.parts ?? [])]);
  for (let round = 0; fields.length < teams && queues.some((q) => q.length > round); round++) {
    shares.forEach((share, k) => {
      if (fields.length >= teams || share.target.kind !== 'field') return;
      const id = queues[k]![round];
      if (id === undefined || used.has(id)) return;
      const fieldId = share.target.id;
      const field = village.fields.find((f) => f.id === fieldId);
      const part = field?.parts.find((p) => p.id === id);
      if (!field || !part) return;
      used.add(id);
      const [dirX, dirZ] = rowDirection(field.parts);
      fields.push({ x: part.x, z: part.z, size: part.size, dirX, dirZ, rows: PLOUGH_ROWS });
    });
  }
  return fields;
}
