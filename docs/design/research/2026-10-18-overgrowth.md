# Zarůstání opuštěného přílohu – ověření herních čísel proti literatuře

_Rešerše k 18. 10. 2026 pro pravidlo „nepasený a nesečený příloh zarůstá“ (Martin, 18. 10. 2026:
„Ano udělej to tak“). Ověřovaná čísla jsou návrh Clauda ze zadání; co se převzalo, zapisuje
`docs/design/fields.md` (Zarůstání, Les vsi, tabulka Rozhodnutí)._

**Verdikty:** _sedí_ = literatura hodnotu podporuje nebo je v rozmezí; _upravit na …_ = literatura
ukazuje jinam; _nedohledáno_ = přímý údaj jsem nenašel. **Vlastní výpočet** je vždy označen.
U zdrojů, ze kterých jsem viděl jen výtah (abstrakt, popis ve vyhledávání), je to uvedeno.

## Co literatura říká

- **Chronosekvence opuštěné louky a pastviny (Chorvatsko, dubohabřina):** stadia odhadnutá
  z terénu, leteckých snímků a rozhovoru s místním hospodářem – travinné stadium s válečkou
  (_Brachypodium pinnatum_) **2–5 let**, keřové stadium se svídou (_Cornus sanguinea_, pokryvnost
  90–100 %), trnkou (_Prunus spinosa_) a ostružiníkem **5–15 let**, porost osiky (_Populus
  tremula_) **15–30 let**, dubohabřina **přes 30 let**; líska (_Corylus avellana_) přibývá až
  v pozdějších lesních stadiích. – Jelinčić, A., Perčin, A., Zgorelec, Ž., Papković, D. (2023):
  Local-scale changes in plant community composition following succession of oak-hornbeam forest
  after grassland abandonment. _Acta Botanica Croatica_ 82(2): 147–150,
  doi:10.37427/botcro-2023-015 (abstrakt a popis stadií ze stránky časopisu).
- **Opuštěná pole v Českém krasu (téměř 50 let sledování):** mezická (běžná) řada jde nejdřív ke
  keřům s převahou **trnky kolem 15. roku** od opuštění, pak k hlohům (_Crataegus_) a k lesu
  s babykou, jasanem a habrem **v průměru zhruba po 7 desetiletích**; u pole obklopeného lesem
  (blízké zdroje semen) se lesní fáze zformuje dřív. Obecně sukcese **po ≈ 20 letech** vede
  k zapojeným porostům dřevin (kromě nejsušších a nejvlhčích míst). Expanzi dřevin zablokuje
  pravidelné kosení nebo pastva, začne-li se **nejpozději kolem 8. roku**; pastva ovcí a koz účinně
  blokuje expanzi trav i dřevin; kosení od 2. roku obnoví louku. – Prach, K. (2023): Sukcese na
  opuštěných polích v Českém krasu po téměř 50 letech. _Živa_ 2/2023: 77–79 (plný text).
- Výchozí projekt: Osbornová, J. a kol. (1990): _Succession in abandoned fields. Studies in Central
  Bohemia, Czechoslovakia._ Kluwer (Geobotany 15); shrnutí pro střední Evropu Prach, K., Lepš, J.,
  Rejmánek, M. (2007): Old field succession in central Europe: local and regional patterns. In:
  Cramer, V. A., Hobbs, R. J. (eds.) _Old Fields._ Island Press (obojí jen citace).
- **Suchá stanoviště:** na opuštěných polích v suché oblasti střední Evropy (175 ploch, 4–71 let)
  vytrvalý travní porost vydržel sedm desetiletí, keře se objevovaly rozptýleně až v pozdních
  stadiích (brzdí je sucho). – Sojneková, M., Chytrý, M. (2015), _Ecological Engineering_ 77
  (jen výtah ve vyhledávání).
- **Trnité keře** šíří zarůstání opuštěných polí a pastvin i v Maďarsku (Cserhát): hloh
  (_Crataegus monogyna_), trnka a šípek (_Rosa canina_); křoviny přecházejí v les, jsou-li blízko
  zdroje semen stromů (jen výtah ve vyhledávání, _Tájökológiai Lapok_).
- **Historický doklad:** plužiny zaniklých středověkých vsí na Drahanské vrchovině se dochovaly
  pod lesem – opuštěná pole zarostla lesem (Černý, E. 1992: Současný stav reliktů zaniklých
  středověkých osad a jejich plužin na Drahanské vrchovině. _Archaeologia historica_ 17 – jen
  výtah ve vyhledávání).

## Ověření čísel

| Číslo                          | Návrh               | Literatura                                                                                       | Verdikt                                                                                                                                |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Louka (travinné stadium)       | do 5 let            | 2–5 let (Jelinčić 2023); vytrvalé byliny od ≈ 4. roku (Prach 2023, Sojneková – Chytrý 2015)      | sedí                                                                                                                                   |
| Křoviny                        | 5–15 let            | 5–15 let (Jelinčić 2023); trnka převládne kolem 15. roku (Prach 2023)                            | sedí – keře se uchytí od ≈ 5. roku, souvislé křoviny jsou ke konci stadia                                                              |
| Mladý les                      | 15–30 let           | osika 15–30 let (Jelinčić 2023); zapojené dřeviny po ≈ 20 letech (Prach 2023)                    | sedí                                                                                                                                   |
| Les – díl vypadne z pole       | přes 30 let         | dubohabřina přes 30 let (Jelinčić 2023); les podle složení ≈ 70 let (Prach 2023)                 | sedí pro zapojený les; „dospělý“ les (složení, velké stromy) až ≈ 70 let – řeší ho dospívání stromů lesa vsi (níž)                     |
| Pastva a seč zarůstání zastaví | ve fázi louky       | kosení nebo pastva nejpozději od ≈ 8. roku (Prach 2023); ovce a kozy blokují dřeviny             | sedí – hra je přísnější (jen do 5 let, pak už keře zůstanou); narostlé dřeviny potlačí kácení a pastva – ve hře je to vrácení do osevu |
| Druhy křovin                   | trnka, šípek, líska | trnka, hloh, svída, ostružiník, šípek (Jelinčić 2023, Prach 2023, Cserhát)                       | **upravit:** trnka, hloh, šípek, svída; líska patří až do mladého lesa a lesa                                                          |
| Druhy mladého lesa             | bříza, osika, líska | osika (Jelinčić 2023); bříza je běžná průkopnická dřevina (neověřeno pro střední Evropu zdrojem) | sedí                                                                                                                                   |
| Dospělé stromy lesa vsi        | –                   | les podle složení ≈ 70 let (Prach 2023); hra: pokácený strom je dospělý za 70 let (forest.md)    | návrh Clauda: dospělé stromy přibývají od 15 let do plné hustoty v 70 letech                                                           |
| Hustota lesa vsi               | –                   | les krajiny ve hře ≈ 5,5 dospělého stromu na políčko 15 × 15 m (vlastní výpočet z vrstvy)        | návrh Clauda: 240 stromů na hektar (jako les krajiny)                                                                                  |

**Vlastní výpočet hustoty:** vrstva překážek krajiny (seed 42, aktuální verze) má na 9 975 políčkách
lesa 54 684 dospělých stromů, tj. ≈ 5,5 na políčko 225 m² ≈ 240 na hektar.

## Co z toho plyne pro pravidlo

Čísla ze zadání (5 / 15 / 30 let) sedí s chorvatskou chronosekvencí přesně a s českou
dlouhodobou studií v rozmezí (keře kolem 15. roku, zapojené dřeviny po 20 letech, les podle složení
po 70 letech – rychleji u lesa). Jediná oprava jsou druhy křovin (líska až v lese). Hra je přísnější
v tom, že zarůstání zastaví jen pastva a seč ve fázi louky (do 5 let, literatura uvádí nejpozději 8. rok) – zjednodušení, které hráči dává jasné „okno“: příloh, na který stáda nedojdou, za pět let
zaroste keři a vrátit ho pak stojí mýcení.
