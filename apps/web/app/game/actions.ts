// Server actions vsi jsou rozdělené podle oblastí v `actions/` (každý soubor má 'use server').
// Tento soubor je jen souhrnný re-export bez 'use server', aby importy v komponentách, hácích
// a mocky v testech zůstaly na `@/app/game/actions`. Sdílené pomocníky drží `actions/_shared.ts`.

export * from './actions/alarm';
export * from './actions/army';
export * from './actions/dev';
export * from './actions/fortification';
export * from './actions/house';
export * from './actions/market';
export * from './actions/vassalage';
export * from './actions/view';
export * from './actions/village';
