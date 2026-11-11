# Kamenné zdivo a kostely – mapa kódu

Návrhy: [stone-masonry.md](../design/stone-masonry.md), [churches.md](../design/churches.md).
Typy `domain/village/types/types-masonry.ts`, čísla `domain/village/rules/rules-masonry.ts`.

## Stavební huť

- **Stav:** `VillageState.lodge` (okruh, den pozvání, `arriving` – mistři a kněží na cestě,
  počítadla odchodu), `VillageState.churches`; mistři a kněz jsou osoby vsi (`Person.mason`,
  `Person.priest`, `Person.masonryXp`). Starší vsi je nemají, převod netřeba.
- **Pozvání** (`domain/village/people/lodge.ts`): `canInviteLodge` (pokřtěný rod, ves s vojvodou,
  huť ještě není), `inviteLodge` (pět mistrů s příchodem za `LODGE.arrivalDays`), `canInviteMaster`
  a `inviteMaster` (chybějící obor stejného okruhu).
- **Příchod:** `lodgeArrivalsDay` je krok dne v `core/simulate.ts` těsně před `occupyEmptyDwellings`;
  losy ze seedu vsi, oboru a dne příchodu. `arriveFromAbroad` (čistá, pro mistra i kněze) vytvoří
  svobodného křesťana ve věku `LODGE.masterAge`, jméno z `MASTER_NAMES` podle okruhu, `origin` podle
  `MASTER_ORIGIN`. Bydlení: volné obydlí bez dílny, jinak host ve dvorci vojvody se záznamem
  `VillageState.displaced` (nové obydlí osídlí přednostně – `rehouseDisplaced`). Kronika `newcomer`.
- **Práce:** `isLodgeIdle` (mistr, kněz) – `villagersToday` (`core/morning-water.ts`) je z práce vsi
  vynechává; jedí jako ostatní (`marriagesAndMealDay` bere všechny osoby).
- **Use-casy:** `application/invite-lodge.ts` (`inviteLodgeForVillage`, `inviteMasterForVillage`,
  texty `INVITE_LODGE_REASONS`); právo `ennoble` v `ACTION_RIGHTS`. Web: `inviteLodgeForPlayer`,
  `inviteMasterForPlayer` v `apps/web/lib/village.ts`, server actions `inviteLodge`, `inviteMaster`.
