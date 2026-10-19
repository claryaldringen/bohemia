# Porody na samici a vyřazování starých kusů – podklady

Krátká rešerše k `docs/design/diet.md` (Rodí všechny samice, Porážka v zimě, Staré kusy), stav 19. 10. 2026. Martin: „Tak většinou se v zimě porážejí staré kusy a na jaře některá mláďata
pokud je jich moc. Navíc ovce, krávy i kozy musí být neustále březí aby dávaly mléko.“ a „A
pastevci by se měli snažit, aby rodily všechny samice.“

**Jak číst:** u každého čísla co uvádí literatura, odkud, a co hra použije. **Omezení:** přímé
raně středověké údaje o plodnosti nemám. Opírám se o nešlechtěná a primitivní plemena
v tradičním chovu (Soay, mangalica, místní kozy v Etiopii a Brazílii), o zooarcheologii
středověké Anglie a o úhyn mláďat z rešerše
[2026-10-19-herds-hay-meat.md](2026-10-19-herds-hay-meat.md). Co mám jen z výtahu vyhledávače, je
označené **(jen výtah)**.

## Porody na samici (HERD_BREEDING)

| Druh     | Literatura                                                                                                                                                                     | Hra                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Kráva    | Jedno tele ročně; úhyn telat v tradičním chovu 21–23 % (FAO – viz herds-hay-meat).                                                                                             | 1 tele × přežití 0,8 = **0,8**  |
| Ovce     | Soay: 80–90 jehňat na 100 bahnic bez péče, s dobrou péčí až 150 (RBST **(jen výtah)**); úhyn jehňat 17–25 %.                                                                   | 1,15 jehněte × 0,8 = **0,92**   |
| Koza     | Místní kozy v tradičním chovu: roční počet kůzlat na kozu 1,45 (Abergelle, Etiopie), plodnost 1,3–1,38 (SRD, Brazílie **(jen výtah)**); dvojčata 10–34 %; úhyn kůzlat 19–25 %. | 1,4 kůzlete × 0,8 = **1,12**    |
| Prasnice | Mangalica 5–6 selat ve vrhu, staré linie na začátku 20. století 8–9 **(jen výtah)**; středověká prasnice jeden vrh ročně (odhad); úhyn selat ve volném chovu vysoký.           | 6 selat × přežití 0,6 = **3,6** |

**Podíl chovných samic ve stádu přes zimu** (`femaleShare`, odhad): krávy 0,5 (zbytek jalovice,
býk, volci na maso), ovce 0,7 (berani, skopci na vlnu, jehnice), kozy 0,7, prasata 0,4 (kanec
a čuníci, kteří se porážejí až ve druhém roce – prasata se porážela do dvou let, Pigs and Pollards
**(jen výtah)**). Dojné samice = samice, které letos rodily; s těmito podíly vyjde mléko jako dřív
(dřív skot 40 %, ovce a kozy 50 % stáda i s mláďaty – u krav o 4 % víc).

**Mláďata na kus stáda** = podíl samic × odchovaná mláďata: ovce **0,64** (dřív 0,4), kozy **0,78**
(0,4), prasata **1,44** (1,0), krávy **0,4** (0,2).

## Staré kusy (HERD_RETIREMENT)

| Druh     | Literatura                                                                                                                                                                   | Hra      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Krávy    | Středověká Anglie: dojnice a tažný dobytek se drží „až do devíti let“, od 650 n. l. přibývá starších kusů v porážce, kolem 900–1100 60 % skotu poraženo ve stáří (PLOS ONE). | **1/10** |
| Ovce     | Kolem 45 % ovcí poraženo v dospělém věku (stupeň opotřebení F a výš), v době vlny přes polovinu do čtyř let (PLOS ONE) – bahnice ≈ 6–8 let (odhad).                          | **1/8**  |
| Kozy     | Bez vlastního údaje – jako ovce.                                                                                                                                             | **1/8**  |
| Prasnice | Prasata se porážela do dvou let; chovná prasnice pár vrhů (odhad).                                                                                                           | **1/4**  |

## Zdroje

- PLOS ONE 2026: Meat, milk, wool and grain: The animal economy of medieval England (CE 400 to 1400) – https://pmc.ncbi.nlm.nih.gov/articles/PMC13537584/
- Pigs and Pollards: Medieval Insights for UK Wood Pasture Restoration –
  https://www.researchgate.net/publication/257518511_Pigs_and_Pollards_Medieval_Insights_for_UK_Wood_Pasture_Restoration
- Rare Breeds Survival Trust – Soay: https://www.rbst.org.uk/soay
- Mangalitza – https://breeds.okstate.edu/swine/mangalitza-swine a
  https://www.thepigsite.com/breeds/mangalitza
- Reproductive Performance of Abergelle Goats Raised under Traditional Management Systems in
  Sekota District, Ethiopia – https://datacatalog.ihsn.org/citations/61134
- Traditional system of goat management. III. Reproductive performance of SRD does and kid
  mortality (EMBRAPA) – https://apct.sede.embrapa.br/pab/article/view/14156
