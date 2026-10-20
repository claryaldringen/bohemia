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
