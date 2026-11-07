// Rozcestník čísel pravidel simulace vsi – vlastní hodnoty jsou v rules-<téma>.ts.

// Meze produktivity (Martin, oprava podle rešerše 17. 10. 2026 – docs/design/research/): práce
// a ztráty, pro které literatura dává rozpětí, mají dvojici { worst, best }. Ves bez řemesel
// platí `worst`, s plně pokrytou potřebou výrobků řemeslníků `best`, mezi tím lineárně podle
// pokrytí (productivity.ts). Kovář posouvá práci (nástroje), hrnčíř ztráty zásob a denní
// minimum (nádoby). Kde literatura dává jedno číslo, platí obojí. Pokrytí počítá ze zásob
// výrobků `craftCoverage` (crafts.ts); ves bez řemesel má pokrytí 0 (NO_CRAFTS), tedy `worst`.

export * from './rules-people';
export * from './rules-fields';
export * from './rules-roads';
export * from './rules-livestock';
export * from './rules-buildings';
export * from './rules-crafts';
export * from './rules-trade';
export * from './rules-lord';
export * from './rules-premium';
