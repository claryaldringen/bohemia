// Čísla zboží vsi (hides-honey.md – Klát u obydlí, Zpracování v domácnosti; návrh Clauda, schváleno
// Martinem 14. 11. 2026).

/**
 * hides-honey.md – Klát u obydlí: klát dá za rok ≈ 6 kg medu a ≈ 0,4 kg vosku, přibývá od května do
 * září (měsíce `fromMonth`–`toMonth` včetně, `seasonDays` = 31 + 30 + 31 + 31 + 30 dní).
 */
export const HIVES = {
  honeyKgPerYear: 6,
  waxKgPerYear: 0.4,
  fromMonth: 5,
  toMonth: 9,
  seasonDays: 153,
} as const;

/**
 * hides-honey.md – Klát u obydlí (prémiová krajina „Brtě a lesní včely“): každá brť přibývá jako klát; med
 * a vosk z nich ves vybere najednou od října (`month`), když má na obchůzku všech brtí
 * dost práce (návrh Clauda).
 */
export const BEE_TREE_HARVEST = { month: 10 } as const;

/**
 * hides-honey.md – Klát u obydlí, diet.md – Pojmy (Martin 14. 11. 2026: „Má ho i jíst“; „Med se
 * nekazí, takže se dá dlouho skladovat a hromadit. Na druhou stranu – med se většinou přidával do
 * sladkého pečiva nebo se z něj dělala medovina – samotného medu totiž člověk moc nesní.“):
 * energie 0,9 kg obilí na kg medu (≈ 3 040 proti 3 400 kcal), pevný příděl 0,5 kg na člověka za
 * rok – denně rovným dílem z toho, co je; zbytek se hromadí (návrh Clauda).
 */
export const HONEY = {
  energyPerKg: 0.9,
  kgPerPersonYear: 0.5,
} as const;

/**
 * hides-honey.md – Zpracování v domácnosti (Martin 14. 11. 2026: tukem a kouřem, kožešina kvašením;
 * tuk, popel a kvas se nepočítají – „Stačí čas domácnosti“; práce a čekání „Souhlas“, spotřeba
 * „Ano“). Domácnosti zpracovávají od listopadu do března (`fromMonth`–`toMonth`), hodiny na
 * člověkoden jako oka (`SMALL_GAME.hoursPerManDay`).
 * - Práce na kus: kůže skotu 10 h, kozí a prasečí 4 h; ovčí kožešina 3 h, zaječí a liščí 1,5 h.
 *   Jelení kůže jako skotu, divočákova jako prasečí (návrh Clauda – velikostí).
 * - Hotové ≈ `cureDays` dní po začátku – louh, kvas a kouř jsou čekání, ne práce.
 * - Plocha usně: kůže skotu ≈ 3 m², kozí a prasečí ≈ 0,8 m² – potřeba je v kůžích skotu, kozí
 *   a prasečí se přepočtou plochou.
 * - Spotřeba za rok: obuv 1 kůže skotu na 6 lidí, řemení a pouzdra 1 kůže skotu na domácnost za
 *   3 roky, postroje 1 kůže skotu na pár volů nebo koně za 5 let; kožich 0,7 ovčí kožešiny na
 *   dospělého a 0,35 na dítě, čepice a rukavice 0,2 kožešiny na člověka.
 */
export const HIDES = {
  hoursPerHide: 10,
  hoursPerSmallHide: 4,
  hoursPerSheepFur: 3,
  hoursPerWildFur: 1.5,
  cureDays: 10,
  hideM2: 3,
  smallHideM2: 0.8,
  peoplePerShoeHide: 6,
  householdYearsPerHide: 3,
  harnessYearsPerHide: 5,
  coatFursPerAdult: 0.7,
  coatFursPerChild: 0.35,
  capFursPerPerson: 0.2,
  fromMonth: 11,
  toMonth: 3,
} as const;
