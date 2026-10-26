# Divoká zvěř vsi – stav, stropy, roční přepočet

Pravidla: [wildlife.md](../design/wildlife.md) (Kde zvěř žije a kolik jí je; Roční přepočet – 1. 5.).
Stav W1: zvěř zatím jen počítá – neškodí a neloví se (to přinášejí další úlohy plánu
`docs/superpowers/plans/2026-10-26-wildlife.md`).

## Stav a stropy

- `VillageState.wildlife?: WildlifeState` (`types-wildlife.ts`): `land` (`WildlifeLand` – les, louky
  a pole, voda v ha, počet tůní), `deer` (jeleni, laně, kolouši), `boar` (dospělá, selata),
  `hares`, `wolves`, `bear { present, backDay }`, `fishKg`. Kusy jsou čísla s podílem. Lišky
  a vrány se neukládají (`wildlifeCaps().foxes`, `crowFlocks(sownHa)`). Další úlohy přidávají jen
  volitelná pole.
- `wildlifeCaps(land, villagePigs)` (`wildlife.ts`) – stropy kusů; čísla v `rules-wildlife.ts`
  (`WILDLIFE_CAPS`, `WILDLIFE_YEAR`, `WILDLIFE_LAND`, `CROWS`) s odkazem na návrh. Lišky se
  zaokrouhlují dolů (kusy).
- `freshWildlife(land, pigs)` – vše na stropu (jelení 2 : 5 : 3, prasata půl na půl, medvěd podle
  lesa).

## Krajina

`wildlifeLandAt(landscape, state)` (`wildlife-land.ts`): políčka do 1 km od `villageOrigin(state)`
(`placement-squares.ts`, totéž místo jako `withLivestockLand`). Les = povrch les + les vsi, bez
čtverců polí/sadů/hřbitovů/ohrad (`villageLandSquares`) a bez políček obydlí, jen souvislé kusy
(4 sousedé, flood fill) od 1 ha; louky = louka + pole; voda = políčka vody; tůně = body osy potoka
s `pool ≥ 0,5` do dosahu, sloučené po 60 m. Počítá se **jen při převodu a 1. 5.** (jednou ročně),
žádný dotaz po dílech. Paseky se nepočítají (zjednodušení).

## Převod a přepočet

- `withWildlife(state, landscape | null)` – chybí `wildlife` → zvěř na stropu; jinak týž objekt
  (idempotence). V `advanceVillageSteps` (`simulate.ts`) a v `update-village.ts` kolem
  `withLivestockLand`. Bez krajiny výchozí `WILDLIFE_LAND.defaultLand` (les 190 ha…). Selhání
  výpočtu krajiny → výchozí krajina a `wildlifeFailed` (log v `updateVillage`).
- `wildlifeYearDay(state, day, landscape)` – v `simulateDay` hned za `updateLordTraining`; jen
  1. 5.: krajina znovu (s krajinou), jelení zvěř (dospění, úbytek 10 % + 1 % na vlka, kolouši =
     laně × 0,6, nad stropem napřed kolouši a laně), prasata (úbytek 20 %, selata = dospělí, nad
     stropem poměrně), zajíci × 2, vlci + ½ chybějícího, medvěd (`bearBackDay(killDay)` = za 3 roky;
     kronika `bear-returned`), ryby logisticky. Bez náhody.

## Vlkov (kopie 26. 10. 2026)

Les 118 ha, louky a pole 132 ha, voda 5,6 ha, 3 tůně; stropy: jelení 5,9, prasata 5,0, zajíci 19,8,
lišky 2, vlci 0,9, medvěd ne (pod 150 ha lesa), ryby 1 681 kg. Převod ≈ 10 ms.
