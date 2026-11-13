import type {
  Construction,
  GridCell,
  JourneyView,
  Landscape,
  SeenCell,
  SeenData,
  SeenFortification,
  SeenPart,
  VillageState,
} from '@bohemia/game';
import { demolitionSiteProgress } from './demolition-view';
import { sceneFortifications } from './fort-view';
import type {
  SceneKiln,
  SceneKilnRemnant,
  SceneSacred,
  SceneThreshingFloor,
  SceneVillage,
} from './village-view-scene-types';
import { scenePlot } from './village-view-scene-types';
import { sceneSacredRuinOf } from './village-view-buildings';
import { sceneKilnRemnantOf, sceneKilnStateOf } from './village-view-crafts';
import { sceneRuinOf } from './village-view-scene';

// Cizí ves ve scéně výjezdu (lord-control.md – Co vojvoda vidí; plán 2026-11-13 – Úloha 9a): jen
// z toho, co rod ví (`SeenCell`). Stejné tvary scény jako u vlastní vsi (`sceneVillage`), jen
// z údajů znalosti. Scéna cizí vsi VYNECHÁVÁ, co z znalosti nemá z čeho kreslit: lidi a jejich
// činnosti (kouř dílen, postavy), pole, zvířata, zásoby a stohy, cesty a pěšiny (`since`),
// průběh rozšiřování ohrady, pec a jámy staveniště kostela, hřbitovy, sady, duby a háje.

/** Políčko, na které se scéna přepne za vojvodou; null – vojvoda je doma, nebo výjezd neběží. */
export function journeyCellOf(view: JourneyView | null, home: GridCell): GridCell | null {
  if (!view) return null;
  return view.cell.x === home.x && view.cell.y === home.y ? null : view.cell;
}

/**
 * Cizí ves ve scéně podle znalosti; null – nic známého. `landscape` je krajina cizí mapy (pozemky
 * a obvod opevnění). Každá stavba nese stav z dne, kdy ji muži viděli (stará zpráva).
 */
export function seenVillageOf(seen: SeenCell | null, landscape: Landscape): SceneVillage | null {
  if (!seen || seen.parts.length === 0) return null;
  const scene: SceneVillage = { dwellings: [], fields: [] };
  const sacred: SceneSacred = { oaks: [], groves: [], buildings: [] };
  const pens: NonNullable<SceneVillage['pens']> = [];
  const churches: NonNullable<SceneVillage['churches']> = [];
  const floors: SceneThreshingFloor[] = [];
  const kilns: SceneKiln[] = [];
  const remnants: SceneKilnRemnant[] = [];
  const ruins: NonNullable<SceneVillage['ruins']> = [];
  const forts: NonNullable<SceneVillage['forts']> = [];
  for (const part of seen.parts) {
    const d: SeenData = part.data;
    switch (d.kind) {
      case 'dwelling': {
        const common = {
          id: d.id,
          type: d.type,
          position: d.position,
          ...(d.plot ? { plot: scenePlot(landscape, d.plot) } : {}),
          ...(d.craft ? { craft: d.craft } : {}),
          ...(d.plainShape ? { plainShape: true as const } : {}),
        };
        scene.dwellings.push(
          d.demolition !== undefined
            ? {
                ...common,
                built: false,
                progress: demolitionSiteProgress(d.demolition),
                demolition: d.demolition,
              }
            : {
                ...common,
                built: true,
                progress: 1,
                // nikdo tu není vidět bydlet – z domu nestoupá dým
                inhabited: false,
                ...(d.condition < 1 ? { condition: Math.round(d.condition * 1000) / 1000 } : {}),
              },
        );
        break;
      }
      case 'site':
        scene.dwellings.push({
          id: d.id,
          type: d.type,
          position: d.position,
          built: false,
          progress: d.progress,
          ...(d.plot ? { plot: scenePlot(landscape, d.plot) } : {}),
          ...(d.craft ? { craft: d.craft } : {}),
          ...(d.plainShape ? { plainShape: true as const } : {}),
        });
        break;
      case 'pen':
        pens.push({
          id: d.id,
          ...(d.species ? { species: d.species } : {}),
          cell: d.cell,
          ...(d.extraSquares
            ? {
                extraSquares: d.extraSquares.map((q) => ({
                  cell: q.cell,
                  x: q.x,
                  z: q.z,
                  ...(q.constructionId === undefined ? {} : { pending: true as const }),
                })),
              }
            : {}),
          ...(d.grid ? { grid: d.grid, rotation: d.grid.rotation } : {}),
          x: d.x,
          z: d.z,
          size: landscape.cellSizeM,
          built: d.built,
          progress: d.progress,
          // bez zvířat, bez zásoby sena – prázdná ohrada
          oxen: 0,
          trainees: 0,
          cows: 0,
          ...(d.built ? { stocked: false as const } : {}),
          ...(d.demolition !== undefined ? { demolition: d.demolition, demolitionSite: d.id } : {}),
          ...(d.condition !== undefined ? { condition: Math.floor(d.condition * 100) / 100 } : {}),
        });
        break;
      case 'sacred':
        sacred.buildings.push({
          id: d.id,
          kind: d.type,
          position: d.position,
          built: d.built,
          progress: d.progress,
          ...(d.condition !== undefined ? { condition: Math.floor(d.condition * 100) / 100 } : {}),
          ...(d.demolition !== undefined ? { demolition: d.demolition } : {}),
        });
        break;
      case 'sacredRuin':
        (sacred.ruins ??= []).push(
          sceneSacredRuinOf({ id: d.id, kind: d.type, position: d.position }, d.overgrowth),
        );
        break;
      case 'church':
        churches.push({
          id: d.id,
          type: d.type,
          dims: d.dims,
          position: d.position,
          progress: d.progress,
          decorated: d.decorated,
          built: d.built,
          priest: false,
          graves: 0,
        });
        break;
      case 'threshing':
        floors.push({
          id: d.id,
          position: d.position,
          built: d.built,
          progress: d.demolition !== undefined ? demolitionSiteProgress(d.demolition) : d.progress,
          ...(d.demolition !== undefined ? { demolition: d.demolition } : {}),
        });
        break;
      case 'kiln':
        kilns.push({
          id: d.id,
          burnerId: d.burnerId,
          x: d.x,
          z: d.z,
          ...sceneKilnStateOf(d.stage, d.progress, d.charcoal),
        });
        break;
      case 'kilnRemnant':
        remnants.push(sceneKilnRemnantOf(d, d.overgrowth));
        break;
      case 'ruin':
        ruins.push(sceneRuinOf({ ...d, day: d.since }, d.overgrowth, landscape));
        break;
      case 'fortification':
        forts.push(...fortOf(d, part, landscape));
        break;
    }
  }
  if (sacred.buildings.length > 0 || sacred.ruins) scene.sacred = sacred;
  if (pens.length > 0) scene.pens = pens;
  if (churches.length > 0) scene.churches = churches;
  if (floors.length > 0) scene.threshingFloors = floors;
  if (kilns.length > 0) scene.kilns = kilns;
  if (remnants.length > 0) scene.kilnRemnants = remnants;
  if (ruins.length > 0) scene.ruins = ruins;
  if (forts.length > 0) scene.forts = forts;
  return scene;
}

/**
 * Opevnění z dat znalosti stejným převodem jako vlastní ves; stáří úseků ke dni, kdy je muži
 * viděli (stará zpráva), stavby z `works` (průběh úseků a bran).
 */
function fortOf(
  d: SeenFortification,
  part: SeenPart,
  landscape: Landscape,
): NonNullable<SceneVillage['forts']> {
  const constructions = d.works.map(
    (w): Construction =>
      ({
        ...w,
        kind: 'fortification',
        fortificationId: d.fort.id,
        startedDay: part.day,
        cost: 0,
        dwellingType: null,
        position: null,
        dwellingId: null,
        fieldId: null,
      }) as unknown as Construction,
  );
  const state: Pick<VillageState, 'fortifications' | 'constructions'> = {
    fortifications: [d.fort],
    constructions,
  };
  return sceneFortifications(state, landscape, part.day);
}
