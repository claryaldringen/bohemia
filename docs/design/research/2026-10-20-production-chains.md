# Rešerše – výrobní řetězy (20. 10. 2026)

Krátké rešerše k [production-chains.md](../production-chains.md) – čísla, která návrh nechal
„upřesní rešerše“. Každá úloha plánu zapisuje sem svou část; čísla jsou v `rules.ts` s odkazem na
příslušnou sekci.

## Humno – cena stavby

Humno je stavba hráče (production-chains.md – Humno): udusaná a vymazaná mlatová plocha
≈ 8 × 10 m s lehkým přístřeškem. Raně středověké prameny pracnost humna neuvádějí – opírá se
o etnografický popis stavby mlatu, o výkony při zemních pracích z experimentů a o rekonstrukci
zahloubeného domu, ze které hra bere cenu obydlí.

### Co víme

| Zdroj                                                                                                      | Co říká                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulgarian Dialectology (UC Berkeley) – Threshing floor construction (nahrávky z bulharských vsí)           | Mlat se dělá na nejrovnějším místě: tráva se oseká motykou a plocha se vyčistí, srovná a zkropí, aby si zem sedla; povrch se uválí kamenným válcem taženým voly, nebo vymaže hnojem s vodou. Přes noc proschne a mlátí se druhý den; každý rok se jen obnovuje. Okraj někde podezdí kameny. |
| Chios – Stone-paved Threshing Floor; Bible encyclopedia (biblicaltraining.org)                             | Mlat je udusaná hlína, spáry a povrch se vymažou směsí hlíny, kravského hnoje a vody, která za pár hodin proschne – zrno nezapadne. Hliněný mlat se udusá do tvrdého hladkého povrchu.                                                                                                      |
| Abrams 1994 (Supplemental Table 1 článku v Latin American Antiquity, Cambridge – člověkoden po 5 hodinách) | Výkop zeminy 2,6 m³, přenos zeminy na 50 m 2,19 m³, uložení zeminy 4,83 m³, nanesení omítky 8 m² – vše za 5hodinový člověkoden. Člověkoden hry má 10 hodin (population.md), tedy dvojnásobek.                                                                                               |
| euroREA 3/2006 – stavba kruhového příkopu a domů středního neolitu (EXARC)                                 | Silný člověk vykope a odhodí ≈ 1,8 m³ zeminy za den.                                                                                                                                                                                                                                        |
| Waldhauser 2008, euroREA 5 (rekonstrukce zahloubeného domu, Všestary; už v rešerši 2026-10-17 – Obydlí)    | Dům 5,4 × 2,64 m: 2,9 m³ dřeva a 1,2 m³ hlíny, ≈ 7 týdnů pro 2 dospělé a 2 děti → ≈ 110–150 člověkodní, tedy ≈ 40–50 čd na m³ dřeva i se stěnami, jámou a krytinou. Hra z něj má polozemnici 220 čd.                                                                                        |

### Odhad

Plocha 8 × 10 m (80 m²): mlat přes celou plochu, vzadu přes celou šířku přístřešek 8 × 3 m
s pultovou doškovou střechou na sloupech (zrno a nářadí v dešti), stoh slámy na kraji
(rozložení upřesní úloha scény).

| Část                                                             | Výpočet                                                                                                 | Člověkodny |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| Sejmutí drnu a srovnání                                          | 80 m² × 0,15–0,2 m = 12–16 m³ – výkop 5,2 m³/čd a uložení (Abrams na 10 h), nebo 1,8 m³/čd s odhozem    | ≈ 4–9      |
| Hlína na mazanici                                                | vrstva ≈ 0,1 m = 8 m³ – výkop 5,2 m³/čd a donesení 4,4 m³/čd na 50 m (hliniště bývá dál)                | ≈ 4–6      |
| Kropení, dusání, vymazání hlínou s hnojem a plevami              | 2–3 vrstvy po 80 m² při 16 m²/čd (nanesení omítky, Abrams na 10 h) a dusání mezi nimi                   | ≈ 10       |
| Přístřešek 8 × 3 m                                               | 6–8 sloupů, 2 vaznice, ≈ 10 krokví, latě – ≈ 1,2 m³ dřeva; bez stěn, jámy, ohniště: ≈ 30–35 čd/m³ dřeva | ≈ 40       |
| Kácení a dovoz 6 stromů (cena stavby ho v sobě má jako u obydlí) | 6 × FELLING_MAN_DAYS_PER_TREE (2 čd)                                                                    | 12         |
| **Celkem**                                                       |                                                                                                         | **≈ 75**   |

**Dřevo:** ≈ 1,2–1,5 m³ – sloupy, vaznice, krokve a latě z **6 tenkých kmenů** (jako ohrada).

**Nerovnost:** mlat musí být rovný – při stavbě se srovná. Rozdíl výšek pod plochou nejvýš
**1 m** (jako u svatyně); víc by znamenalo terasu.

### Návrh pro hru (návrh Clauda)

`HUMNO` v `rules.ts`: půdorys 8 × 10 m, **75 člověkodní** (i s kácením blízkého lesa jako cena
obydlí – samotná stavba 63 čd, kácení podle vzdálenosti stromů), **6 stromů** dřeva předem,
nerovnost nejvýš 1 m. Návrh v production-chains.md počítal s cenou polozemnice bez jámy
(≈ 200 čd) – humno ale nemá stěny, ohniště ani podlahu domu, přístřešek je lehký a otevřený;
nová ves se dvěma dospělými ho postaví za ≈ 50 dní volné práce, takže stihne první žně.

### Zdroje

- [Bulgarian Dialectology – Threshing floor construction](https://bulgariandialectology.berkeley.edu/thematic-content/threshing-floor-construction)
- [Chios – Stone-paved Threshing Floor A](https://trekking.chios.gr/?p=1124)
- [Biblical Training – Threshing floor](https://www.biblicaltraining.org/library/threshing-floor)
- [Abrams 1994 – tabulka výkonů (doplněk článku, Cambridge)](https://static.cambridge.org/content/id/urn:cambridge.org:id:article:S1045663500008750/resource/name/S1045663500008750sup002.pdf)
- [euroREA 3/2006 – Construction of a circular ditch system and houses of the Middle Neolithic](https://EXARC.net/sites/default/files/exarc-eurorea_3_2006-construction_of_a_circular_ditch_system_and_houses_of_the_middle_neolithic.pdf)
- [Waldhauser 2008 – Destruction mechanisms of a sunken floored house (euroREA 5)](https://exarc.net/sites/default/files/exarc-eurorea_5_2008-destruction_mechanisms_of_a_sunken_floored_house.pdf)

## Výmlat na humně – kapacita humna a nouzový výmlat

Výmlat hned po žni (production-chains.md – Humno, fields.md – Výmlat hned po žni): kolik práce
výmlatu zvládne jedno humno za den, a co stojí nouzový výmlat starší vsi na udusané zemi bez
humna. Práce výmlatu na hektar se nemění (fields.md – Práce: výmlat cepem a převívání 15 / 10
člověkodní na hektar, Clark 2007 podle EB 1911).

### Co víme

| Zdroj                                                                       | Co říká                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encyclopaedia Britannica – Flail                                            | Jeden člověk vymlátí cepem za den ≈ 7 bušlů pšenice (≈ 190 kg), 8 bušlů žita, 15 ječmene, 18 ovsa.                                                                                                |
| Wikipedia – Threshing (průměr z 19. st.)                                    | „Slušný průměr“ za den: 8 bušlů pšenice (≈ 220 kg), 30 ovsa, 16 ječmene, 8 žita.                                                                                                                  |
| Image Leicestershire – Threshing With Flails                                | Jeden mlatec ≈ 4 bušly (≈ 110 kg) za den; na fotografii mlátí dva muži proti sobě.                                                                                                                |
| Heidelberg, Tools & Tillage – Threshing machines                            | Průměrný cep 5–6 bušlů za den; žentourová mlátička se 6 muži ≈ 160 bušlů (≈ 2,4 ha pšenice) za 10hodinový den – pětinásobek.                                                                      |
| Dúchas (irský folklór), Wikipedia – Threshing floor                         | Na mlatu stodoly se mlátilo většinou ve dvou (proti sobě, střídavé údery), mlatci stáli kolem rozložených snopů; mlat bývá v prostředním poli stodoly, velké stodoly mají dva i tři.              |
| Al-Rawi 1989 (AGRIS, Jordánsko), FAO – Post-harvest losses; AGRIS (Etiopie) | Ztráty při výmlatu: ječmen 8,2 %, čočka 15,6 % (rozsypané a nevymlácené zrno, zlomená zrna); výmlat podporuje i hmyz. Zrno mlácené na holé zemi má víc plísní a toxinů (čirok v Etiopii – AGRIS). |

Hra počítá výmlat i s odvíváním, nošením snopů na humno, obracením slámy a odnosem zrna:
15 / 10 člověkodní na hektar při úrodě ≈ 500–760 kg zrna je ≈ 50–75 kg na člověkoden, tedy
zhruba třetina až polovina samotného mlácení cepem – zbytek je práce kolem.

### Odhad

- **Kolik lidí naráz na humně 8 × 10 m:** mlatci mlátí v párech proti sobě (cep – násada ≈ 1,5 m
  a tlouk ≈ 0,7 m, každý potřebuje ≈ 2,5 m prostoru); na mlatu 8 × 7 m (bez přístřešku 8 × 3 m)
  se vejdou **≈ 4 páry**, k nim **≈ 4 pomocníci** (snopy na mlat, obracení a odhrabování slámy,
  odvívání lopatou proti větru na kraji, odnos zrna). Celkem **≈ 12 lidí, tedy 12 člověkodní
  výmlatu za den**.
- **Kolik osevu humno stačí vymlátit:** v srpnu a září (61 dní) ≈ 730 člověkodní – při 15 / 10
  člověkodnech na hektar **≈ 50–75 ha osevu, tedy humno na ≈ 60 ha** (návrh v production-chains.md
  sedí). Ves s větším osevem potřebuje další humno, jinak výmlat přeteče za okno a snopy se kazí.
- **Nouzový výmlat na udusané zemi (rok odkladu starší vsi):** bez vymazaného mlatu se zrno
  ztrácí v zemi a mezi hroudami, sláma se hůř obrací a zrno se musí víc čistit od hlíny –
  **o 30 % víc práce** a **o 10 % zrna méně** (ztráty při výmlatu v pramenech 8–16 % i na
  připraveném mlatu, na holé zemi víc; 10 % je mírná hodnota pro jeden přechodný rok). Místo
  nouzový výmlat neomezuje – mlátí se u každého domu.
- **Snopy, které čekají:** klasy se ve snopech neskladovaly (Martin) – myši, ptáci, vlhko
  a klíčení; návrh **10 % za měsíc** (production-chains.md) zůstává, kazí se jen snopy, které se
  nemlátí (bez humna, nebo výmlat okno nestihl).

### Návrh pro hru (návrh Clauda)

`THRESHING` v `rules.ts`: `floorManDaysPerDay` 12, `graceDays` 365, `emergencyWork` 0,3,
`emergencyLoss` 0,1, `spoilPerMonth` 0,1; upozornění „Před žněmi postav humno“ `noticeDaysBefore`
90 dní před sklizní (humno za 75 čd malá ves za měsíc nestihne – v létě bere práci žeň).

### Zdroje

- [Encyclopaedia Britannica – Flail](https://www.britannica.com/technology/flail)
- [Wikipedia – Threshing](https://en.wikipedia.org/wiki/Threshing)
- [Wikipedia – Threshing floor](https://en.wikipedia.org/wiki/Threshing_floor)
- [Image Leicestershire – Threshing With Flails](https://imageleicestershire.org.uk/view-item?i=19152)
- [Tools & Tillage – Threshing machines (Universität Heidelberg)](https://digi.ub.uni-heidelberg.de/diglit/tools_tillage1972_1975/0023)
- [Dúchas – Árd-chill (irský folklór o výmlatu)](https://www.duchas.ie/en/cbes/5044839/5043174/5094101)
- [FAO – Post-harvest losses (Agricultural engineering in development)](https://www.fao.org/docrep/t0522e/T0522E04.htm)
- [AGRIS – Al-Rawi 1989, Harvest and post-harvest grain losses (Jordánsko)](https://agris.fao.org/search/en/records/6471cbde2a40512c710e5a6a)
- [AGRIS – mykotoxiny v čiroku mláceném na holé zemi (Etiopie, East Hararghe)](https://agris.fao.org/search/fr/records/68dbb2c62caea822a8e3495c)
