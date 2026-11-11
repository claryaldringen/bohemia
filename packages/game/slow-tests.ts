// Pomalé testy (desítky sekund až minuty) – běžné `npm run test` je nepouští, jedou v
// `npm run test:slow`. Při změně `domain/landscape`, `world/skeleton` nebo pravidel simulace vsi
// je nutné pustit obojí.
export const SLOW_TESTS: readonly string[] = [
  // pásma srovnatelnosti krajin (premium a kostra světa)
  'src/domain/landscape/**/__tests__/*band*.test.ts',
  // dlouhé běhy správce a simulace vsi (10 a 25 let, 80 let)
  'src/domain/village/__tests__/steward-slow.test.ts',
  'src/domain/village/__tests__/simulate-slow.test.ts',
  // zlatý otisk vsi po 2. a 3. roce
  'src/domain/village/__tests__/village-golden-long.test.ts',
];
