// Ohrady ve vsi bez Babylonu (docs/design/oxen.md): z dat vsi pro scénu, které ohrady se
// kreslí (čtverec, průběh stavby, branka ke vsi) a jaká zvířata v nich stojí (voli spřežení –
// ne v den orby, když jsou na poli –, telata ve výcviku, krávy v zimě). Kde orá spřežení, určuje
// plough-front.ts. Kreslí village-renderer.ts (pen-renderer.ts, pen-animals.ts,
// plough-team-renderer.ts).
import type { SceneVillage } from '../village-view';
import { penFacing, type PenHerd } from './pen-layout';
import type { PenView } from './pen-renderer';
import { ploughingToday } from './plough-front';

/**
 * Ohrady ke kreslení: čtverec, branka k nejbližšímu obydlí (bez obydlí dolů, −z), průběh stavby
 * (hotová 1) a stav opuštěné ohrady (abandonment.md – rozpad).
 */
export function scenePenViews(village: Pick<SceneVillage, 'pens' | 'dwellings'>): PenView[] {
  return (village.pens ?? []).map((pen) => {
    // natočená ohrada (fields.md – Natočené stavby) – natočení kolem středu čtverce
    const square = {
      x: pen.x,
      z: pen.z,
      size: pen.size,
      ...(pen.rotation !== undefined ? { rotation: pen.rotation } : {}),
    };
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
 * stáda (v zimě – oxen.md). Nedostavěná ohrada žádná. `teamsOut` = kolik spřežení dnes orá
 * (plough-front.ts – `ploughFront`): voli ohrad se spřežením v pořadí id, kteří se na čelo
 * orby nevešli, zůstanou v ohradě; bez údaje jsou v den orby na poli všichni.
 */
export function penHerds(
  village: Pick<SceneVillage, 'pens' | 'labor'>,
  teamsOut = ploughingToday(village) ? Infinity : 0,
): Map<number, PenHerd> {
  const pens = village.pens ?? [];
  // spřežení na poli patří ohradám s voly v pořadí id (jako v plough-front.ts)
  const away = new Set(
    pens
      .filter((p) => p.oxen > 0)
      .map((p) => p.id)
      .sort((a, b) => a - b)
      .slice(0, teamsOut),
  );
  const herds = new Map<number, PenHerd>();
  for (const pen of pens) {
    if (!pen.built) continue;
    const oxen = away.has(pen.id) ? 0 : pen.oxen;
    herds.set(pen.id, { oxen, trainees: pen.trainees, cows: pen.cows });
  }
  return herds;
}
