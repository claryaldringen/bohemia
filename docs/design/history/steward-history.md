# Správce vsi – historie (neplatné sekce)

Sem patří části [steward.md](../steward.md), které přestaly platit; zachované doslova, aby šlo dohledat, proč se od nich ustoupilo. **Nic z tohoto textu neplatí** – platný stav je v steward.md.

## Cíl polí podle potřeby z pole

Neplatí od 18. 11. 2026 (Martin na otázku „Má správce stavět tolik polí, kolik jich ves zvládne obdělat, bez ohledu na to, co jí?“: „Ano. Přebytky mohou jít na vazalské dávky, do zásob atd. Cílem vesnice je prostě produkovat maximum všeho.“; steward.md – Cíl „Růst se zásobou“, Cíl polí). S masem a ovocem bez stropů (diet.md – Strava po vrstvách a porážka celý rok) klesl podíl jídla z pole a správce stavěl méně polí. Dřívější výpočet zůstal jen jako opatrný cíl vsi bez pole v oběhu, a to s celou potřebou z pole (podíl 1). Dřív v Cíli „Růst se zásobou“:

- **Cíl polí:** pole v oběhu mají uživit lidi, kteří ve vsi budou za `STEWARD.fieldLeadYears`
  (≈ 2 roky – výhled `expectedYearlyFoodNeed`), × `STEWARD.fieldReserve` (≈ 1,1) ÷ očekávaná
  úroda let s počasím (`sowingYieldFactor` ≈ 0,95 – ves s ní seje taky), a navíc lidé, jejichž
  úroda by za `FIELD_STORES.balanceYears` (3 roky) doplnila chybějící pojistku zásob. „Pole
  uživí“ (`steadyHarvestKg`) pojistku jen **udržuje** – ves, která ji nemá, by si ji z polí
  v ustáleném oběhu nikdy nenaplnila. Rezerva dá vesničanům díly nad potřebu na kruté roky –
  osejí je sami (fields.md – Osevní postup po dílech). **Nejvýš** ale tolik, kolik ves oseje
  podle práce a osiva (model kapacity níž) × `STEWARD.fieldReserve`, a doplnění pojistky jen,
  když ves brzdí půda.

Dřív v Modelu kapacity vsi:

- **Cíl polí** nejvýš lidé, které uživí osev podle práce a osiva, × `fieldReserve` – pole, která
  ves neoseje, jen zarůstají a vracení přílohu bere práci oknům setí. Doplnění pojistky polí jen
  při úzkém hrdle půda (při hrdle práce nebo osiva víc polí pojistku nedoplní – dřív spirála
  „nízká pojistka → víc polí“).

Dřív v Den správce – upřesnění:

- **Cíl polí:** lidé × (výhled potřeby za `fieldLeadYears` = 2 roky ÷ dnešní potřeba) ×
  `fieldReserve` (1,1) ÷ `sowingYieldFactor` + (pojistka − zásoby, které k příští sklizni zbudou)
  ÷ `FIELD_STORES.balanceYears` ÷ úroda na člověka z „Pole uživí“ – proti „Pole uživí podle dnešní
  půdy“; zakládané díly se počítají jako v oběhu (jinak by správce zakládal, dokud se první pole
  nedostaví).

Dřív v tabulce Rozhodnutí: „Hodnota a cena v člověkodnech za rok; cíl polí na lidi za 2 roky × 1,1“
(návrh Clauda) a „Model kapacity vsi: cíl polí nejvýš podle práce v oknech setí, „je kam“
a přelidnění podle trvalého hrdla“ (návrh Clauda – Martin 1. 11. 2026: „Vylepši ho“).
