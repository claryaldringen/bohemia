// Ohrady ve vsi bez Babylonu (docs/design/oxen.md): z dat vsi pro scénu, které ohrady se
// kreslí (čtverec, průběh stavby, branka ke vsi) a jaká zvířata v nich stojí (voli – ne ti, kteří
// dnes orají nebo táhnou vůz –, telata ve výcviku, krávy v zimě). Kde orá spřežení, určuje
// plough-front.ts. Kreslí village-renderer.ts (pen-renderer.ts, pen-animals.ts,
// plough-team-renderer.ts).
import { penGateToward } from '@bohemia/game';
import { demolitionSiteProgress } from '../demolition-view';
import type { SceneVillage } from '../village-view';
import type { PenHerd } from './pen-layout';
import type { PenView } from './pen-renderer';
import { grazingHorses } from './livestock-placement';
import { ploughingToday } from './plough-front';

/**
 * Ohrady ke kreslení: čtverec, branka k nejbližšímu obydlí (bez obydlí dolů, −z), průběh stavby
 * (hotová 1) a stav opuštěné ohrady (abandonment.md – rozpad).
 */
export function scenePenViews(
  village: Pick<SceneVillage, 'pens' | 'dwellings'> & Partial<Pick<SceneVillage, 'tornado'>>,
): PenView[] {
  const tornado = village.tornado
    ? { strength: village.tornado.strength, track: village.tornado.track }
    : null;
  return (village.pens ?? []).map((pen) => {
    // natočená ohrada (fields.md – Natočené stavby) – natočení kolem středu čtverce
    const turned = pen.rotation !== undefined ? { rotation: pen.rotation } : {};
    const square = { x: pen.x, z: pen.z, size: pen.size, ...turned };
    // ohrada o víc čtvercích (oxen.md – Ohrady podle druhu): plot kolem hotových čtverců,
    // rozšíření ve stavbě vytyčené
    const ready = (pen.extraSquares ?? []).filter((q) => !q.pending);
    const pending = pen.built ? (pen.extraSquares ?? []).filter((q) => q.pending) : [];
    const fenced = pen.built ? ready : (pen.extraSquares ?? []);
    // branka k nejbližšímu obydlí – stejně jako vchod v síti pěšin (paths.md – Vchody)
    const toward = penGateToward([square, ...fenced], village.dwellings);
    return {
      id: pen.id,
      ...(pen.species === undefined ? {} : { species: pen.species }),
      square,
      facing: { x: toward.x - pen.x, z: toward.z - pen.z },
      // bouraná ohrada je stavba pozpátku (demolition.md – plot ubývá po fázích stavby)
      progress:
        pen.demolition !== undefined
          ? Math.min(0.999, demolitionSiteProgress(pen.demolition))
          : pen.built
            ? 1
            : Math.min(0.999, Math.max(0, pen.progress)),
      ...(pen.condition === undefined ? {} : { condition: pen.condition }),
      ...(pen.hay === undefined ? {} : { hay: pen.hay }),
      ...(tornado ? { tornado } : {}),
      ...(fenced.length > 0 ? { extra: fenced.map((q) => ({ x: q.x, z: q.z })) } : {}),
      ...(pending.length > 0
        ? {
            pending: pending.map((q) => ({
              cell: q.cell,
              x: q.x,
              z: q.z,
              size: pen.size,
              ...turned,
            })),
          }
        : {}),
    };
  });
}

/**
 * Zvířata ohrad podle id: vycvičení voli (u rádla a vozů jsou venku), telata ve výcviku a krávy
 * stáda (v zimě – oxen.md). Nedostavěná ohrada žádná. `oxenOut` = kolik volů je dnes venku – páry
 * u rádel (plough-front.ts – `ploughFront`) a voli vozů (`draftTeamsToday`): odcházejí z ohrad
 * v pořadí id, ostatní zůstanou v ohradě; bez údaje jsou v den orby na poli všichni. Koně ohrady
 * koní: v létě s pasákem jsou na pastvě se stády (`grazingHorses`), v ohradě zůstanou jen koně pod
 * jezdcem; v zimě a bez pasáka stojí všichni v ohradě (horses.md – Ve scéně). Kůň jezdce je
 * mimo ohradu jen v bloku jízdy (`ridingNow` – id koní na cestě, riders.ts `isRiding`), jinak
 * stojí v ohradě v noci i v zimě a v létě podle `grazingHorses`.
 */
export function penHerds(
  village: Pick<SceneVillage, 'pens' | 'labor'> &
    Partial<Pick<SceneVillage, 'dwellings' | 'livestock'>>,
  oxenOut = ploughingToday(village) ? Infinity : 0,
  ridingNow: ReadonlySet<number> = new Set(),
): Map<number, PenHerd> {
  const pens = village.pens ?? [];
  // voli venku patří ohradám v pořadí id (jako páry v plough-front.ts)
  let out = oxenOut;
  const away = new Map<number, number>();
  for (const pen of [...pens].sort((a, b) => a.id - b.id)) {
    const n = Math.min(pen.oxen, out);
    if (n <= 0) continue;
    away.set(pen.id, n);
    out -= n;
  }
  const grazing = new Set(grazingHorses(village).map((h) => h.id));
  // kůň na jízdě je mimo ohradu (jeho kůň jede s jezdcem – riders.ts), jinak v ohradě
  for (const id of ridingNow) grazing.add(id);
  const herds = new Map<number, PenHerd>();
  for (const pen of pens) {
    if (!pen.built) continue;
    const oxen = pen.oxen - (away.get(pen.id) ?? 0);
    const herd: PenHerd = { oxen, trainees: pen.trainees, cows: pen.cows };
    if (pen.species === 'horse') {
      herd.horses = (pen.horses ?? []).filter((h) => !grazing.has(h.id)).map((h) => h.kind);
    }
    herds.set(pen.id, herd);
  }
  return herds;
}
