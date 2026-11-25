import {
  SURFACE_CODES,
  foundVillage as foundVillageState,
  type Landscape,
  type VillageState,
} from '@bohemia/game';

/** Louka 32 × 32 políček (480 m) pro testy pohledu na odchod. */
export function makeLandscapeForTests(): Landscape {
  const size = 32;
  return {
    size,
    cellSizeM: 15,
    heights: new Float32Array(size * size),
    surface: new Uint8Array(size * size).fill(SURFACE_CODES.meadow),
    fertility: new Uint8Array(size * size).fill(50),
    villageSite: { x: size / 2, y: size / 2 },
    stream: [],
    obstacleLayer: null,
  } as unknown as Landscape;
}

/** Čerstvá ves (stavba první zemnice) založená v den 1000. */
export function foundVillage(): VillageState {
  return foundVillageState({ seed: 3, day: 1000, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
}

/** Ves se stojící první zemnicí – domácnost zakladatelů bydlí v obydlí. */
export function withBuiltFirstDwelling(state: VillageState): VillageState {
  const site = state.constructions.find((c) => c.dwellingId !== null)!;
  return {
    ...state,
    constructions: [],
    dwellings: [
      {
        id: site.dwellingId!,
        type: 'zemnice',
        builtDay: state.foundedDay,
        condition: 1,
        position: { ...site.position! },
      },
    ],
  };
}
