import type { PlacementCheck, PlacementVillage } from '@bohemia/game';
import { placementVillageFromScene } from './village-view-scene';
import type { SceneVillage } from './village-view-scene-types';

// Varování u kurzoru při stavbě nebo poli pokřtěného rodu (christianity.md – Co křest rodu
// umožní): posvátná místa a hřbitov, který smí zmizet, stavbě nebrání – ale hráč má vědět, že je
// zničí. Nic se nepočítá jinak: stejná kontrola umístění z jádra se pustí ještě jednou s vsí, jak
// by ji viděl pohanský rod (`sacredFree` chybí – `sacredSitesOf` místo `sacredSitesFor`), resp.
// s hřbitovem, který smí zmizet. Co by pohanovi brání nebo co by ušetřil („zůstane stát“ –
// `sparedWarning`), pokřtěný vykácí; hřbitov, se kterým by stavba neprošla, zaorá – jako server
// (`applyBuildIntent`).

export const DESECRATION_WARNINGS = {
  grove: 'Vykácí posvátný háj.',
  oak: 'Vykácí posvátný dub.',
  cemetery: 'Zaorá starý hřbitov.',
} as const;

/** Ves, jak ji vidí pohanský rod (posvátná místa brání, hřbitov stojí) – jednou na scénu. */
const paganVillages = new WeakMap<SceneVillage, PlacementVillage>();

function paganVillage(scene: SceneVillage): PlacementVillage {
  const cached = paganVillages.get(scene);
  if (cached) return cached;
  const pagan: SceneVillage = { ...scene };
  delete pagan.sacredFree;
  const village = placementVillageFromScene(pagan);
  paganVillages.set(scene, village);
  return village;
}

/**
 * Posvátné místo, které pohanská kontrola chrání: neprošla (důvod jádra – háj, nebo dub) nebo
 * prošla s upozorněním, co vesničané ušetří (`sparedWarning` – „Dubový háj zůstane stát“,
 * „Posvátný dub zůstane stát“, „Posvátné duby zůstanou stát (n)“).
 */
function sacredKinds(check: PlacementCheck): ('grove' | 'oak')[] {
  if (!check.ok) return [(check.reason ?? '').includes('háj') ? 'grove' : 'oak'];
  const lines = (check.warning ?? '').split('\n');
  const kinds: ('grove' | 'oak')[] = [];
  if (lines.some((l) => l.startsWith('Dubový háj zůstane'))) kinds.push('grove');
  if (lines.some((l) => l.startsWith('Posvátný dub zůstane') || l.startsWith('Posvátné duby'))) {
    kinds.push('oak');
  }
  return kinds;
}

/**
 * Varování, co stavba pokřtěného rodu zničí, nebo undefined. `recheck` je táž kontrola umístění
 * jako u kurzoru s jinou vsí; pohanská ves (bez `sacredFree`) varování nemá.
 */
export function desecrationWarning(
  scene: SceneVillage,
  recheck: (village: PlacementVillage) => PlacementCheck,
): string | undefined {
  if (!scene.sacredFree) return undefined;
  const baptized = placementVillageFromScene(scene);
  const pagan = paganVillage(scene);
  const lines: string[] = sacredKinds(
    recheck({ ...pagan, cemeteries: baptized.cemeteries ?? [] }),
  ).map((kind) => DESECRATION_WARNINGS[kind]);
  // hřbitovy, které smějí zmizet, pohanská ves zná (pokřtěná je vynechá)
  const hidden = (pagan.cemeteries?.length ?? 0) > (baptized.cemeteries?.length ?? 0);
  if (hidden && !recheck({ ...baptized, cemeteries: pagan.cemeteries ?? [] }).ok) {
    lines.push(DESECRATION_WARNINGS.cemetery);
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** Připojí varování ke kontrole, která prošla (jiná varování zůstanou nad ním). */
export function withDesecration<C extends PlacementCheck>(check: C, warning?: string): C {
  if (!check.ok || warning === undefined) return check;
  return { ...check, warning: check.warning ? `${check.warning}\n${warning}` : warning };
}

/**
 * Kontrola umístění u kurzoru (`run` nad vsí ze scény) s varováním, co stavba pokřtěného rodu
 * zničí. Pohanská ves – jen kontrola.
 */
export function checkWithDesecration<C extends PlacementCheck>(
  scene: SceneVillage,
  run: (village: PlacementVillage) => C,
): C {
  const check = run(placementVillageFromScene(scene));
  if (!check.ok || !scene.sacredFree) return check;
  return withDesecration(check, desecrationWarning(scene, run));
}

/** Totéž pro stavbu po čtvercích a obvod opevnění (kontrola je v `check`). */
export function squaresWithDesecration<S extends { check: PlacementCheck }>(
  scene: SceneVillage,
  run: (village: PlacementVillage) => S,
): S {
  const result = run(placementVillageFromScene(scene));
  if (!result.check.ok || !scene.sacredFree) return result;
  const warning = desecrationWarning(scene, (village) => run(village).check);
  return { ...result, check: withDesecration(result.check, warning) };
}
