# Zemní práce vozové cesty – podklady

Krátká rešerše k [roads.md](../roads.md) – Vozová cesta, stav 20. 10. 2026. Martin: „Pokud budou
překážet svahy, vyhloubí se úvoz nebo udělá násep. Samozřejmě, některé svahy budou tak velké, že
se budou muset kombinovat serpentiny, úvozy a náspy.“ Zadání koordinátora dalo orientačně
≈ 0,5 člověkodne na m³ zemních prací a ≈ 0,3 člověkodne na metr zpevnění kolejí – tady je ověření.

**Jak číst:** u každého čísla co uvádí literatura, odkud, a co hra použije. **Omezení:** normy
jsou ze současných pracovně náročných staveb venkovských cest (ILO, Světová banka) s ocelovým
nářadím a kolečkem; raně středověká čeleď kopala dřevěnou rýčí s okovaným ostřím a motykou
a hlínu nosila v koších a na nosítkách. Přímé údaje pro raný středověk nemám – přepočet je odhad
Clauda. Tabulka M15 je ze skenu na sdílené stránce (shoduje se s tabulkou K2 z téhož průvodce),
proto **(sken)**.

## Výkony práce (člověkoden = čd)

| Činnost                        | Literatura                                                                                                                                                                                        | Hra (`WAGON_ROAD` v `rules.ts`)                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Výkop                          | ILO, Best Practice Guide (Part 1, Appendix 1), Table M15 **(sken)**: měkká 5,0, střední 3,5, tvrdá 3,0, velmi tvrdá 2,0 m³ za čd; Table K2: sypká 5,1, ulehlá 2,7 m³ za čd (World Bank, Tab F-3). | výkop s naložením **0,5 čd/m³** (`digPerM3`) – se dřevěným nářadím ≈ 2 m³ za čd (ulehlá hlína 2,7 → o čtvrtinu méně)                        |
| Házení lopatou na 0–8 m        | Table G2 (de Veen 1980): ulehlá půda 3,5–4,5 m³ (0–4 m), 2,5–3,5 m³ (6–8 m) za čd.                                                                                                                | výkop na pláni se hází na svah a do náspu vedle – v ceně výkopu                                                                             |
| Naložení                       | M15: 8,5 m³ za čd; K2: 3,8 m³ (zdvih 1 m).                                                                                                                                                        | v ceně výkopu (`digPerM3`)                                                                                                                  |
| Rozhrnutí a udusání násypu     | M15: vysypání 10, rozhrnutí 13,5, ruční hutnění 9 m³ za čd; K2: rozhrnutí 11, dusání pěchem 3,8 m³ za čd (vrstva 75 mm, 3 průchody).                                                              | **0,2 čd/m³** (`placePerM3` – rozhrnutí 0,07 + udusání 0,11 ≈ 0,19)                                                                         |
| Převoz hlíny                   | Table M7 a M15 – kolečko: 8,5 m³ za čd do 20 m, 7,0 do 40 m, 6,5 do 60 m, 5,5 do 80 m, 5,0 do 100 m, 4,5 do 150 m; K2: kolečko 2,2 m³ za čd na 100 m.                                             | koše a nosítka o polovinu pomaleji než kolečko: **0,15 + 0,15 čd na každých 100 m na m³** (`haulPerM3`; 125 m → 0,34, kolečko × 1,5 = 0,33) |
| Kámen do kolejí a úprava pláně | K2: sběr kamene do 1 km 2,5 m³ za čd, volné kladení kamene 1,5 m³ za čd, vytyčení 100 m za čd (ILO CTP 40).                                                                                       | **0,3 čd na metr** (`pavingPerM` – odhad níž)                                                                                               |
| Kácení a klučení               | M15: hustý porost 100, střední 200, řídký 350 m² za čd, klučení 175 m² za čd.                                                                                                                     | jako průsek lesem – tabulka překážek (`OBSTACLE_COST`, `ROAD_SWATH`), beze změny                                                            |

**Zpevnění kolejí na metr cesty** (odhad Clauda): dvě koleje po 0,5 m do hloubky 0,15 m = 0,15 m³
kamene a štěrku na metr – sběr a donesení 0,06 čd, uložení a udusání ≈ 0,05 čd; srovnání
a udusání vrchní vrstvy pláně 5,5 m × 0,1 m = 0,55 m³ → ≈ 0,1 čd; krajnice, vytyčení a odvodnění
≈ 0,05 čd. Dohromady ≈ 0,25–0,3 čd/m – hra bere 0,3 ze zadání.

## Sklon a příčný řez

| Údaj                   | Literatura                                                                                                                                                                                           | Hra                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Největší podélný sklon | Practical Action, Improving paths and tracks (část 3): žádoucí nejvyšší sklon pro povozy tažené zvířaty **8 %** (1 : 12); kolo s vozíkem 5 %, kolo 7 %, nosič s nákladem 10 %, chodec a soumar 12 %. | **6 %** (`maxGrade` – zadání; přísněji než žádoucí mez – naložený čtyřkolák do kopce i z kopce, kde se brzdí jen smykem); vozová síť dál projede do 10 % (`CART_ROUTES.maxGrade`) |
| Svahy výkopu a náspu   | běžná hlína bez opevnění 1 : 1 až 1 : 1,5 (obecná praxe zemních prací, bez konkrétního zdroje).                                                                                                      | **1 : 1** (`sideSlope`)                                                                                                                                                           |
| Šířka                  | zadání: vozovka ≈ 3,5 m.                                                                                                                                                                             | vozovka 3,5 m, po 1 m krajnice – pláň 5,5 m (`bedHalfM`, `flatHalfM`)                                                                                                             |
| Hloubka úvozu a náspu  | zadání: nejvýš 3 m.                                                                                                                                                                                  | 3 m (`maxCutM`, `maxFillM`)                                                                                                                                                       |

## Co z toho plyne pro trasu

Metr úvozu hlubokého 2 m na pláni 5,5 m se svahy 1 : 1 je ≈ 15 m³ (průřez 11 + 2 × 2 m²) – s převozem do náspu ≈ 10–14 čd
na metr. Serpentina stejného převýšení v mírném svahu (o 50–100 m delší) stojí 15–30 čd zpevnění.
Bez provozu se tedy úvoz skoro nikdy nevyplatí a trasa jde serpentinou; úvoz a násep vyjdou jen
u krátkého prudkého svahu na cestě s hodně jízdami (čas vozu za 10 let – `trafficYears`) nebo
tam, kde serpentina nemá místo. Viz Vlkov a ukázka v roads.md.

## Zdroje

- ILO ASIST: Best Practice Guide, Part 1, Appendix 1 – Table G2 (de Veen 1980), Table K2
  (Productivity data for standard conditions; World Bank, Tab F-3 až F-9; ILO CTP 40), Table M7
  (Wheelbarrow haulage norms – recommended values), Table M15 (Summary of recommended values).
  https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_emp/@emp_policy/@invest/documents/instructionalmaterial/wcms_asist_8390.pdf
- ILO ASIST: Technical Brief No. 2 – Productivity Norms for Labour-based Construction
  (k ověření tabulky M15 – nečetl jsem, jen odkaz z vyhledávání).
- Practical Action: Improving paths and tracks, part 3 (KnO-100388) – tabulka žádoucích
  nejvyšších sklonů podle druhu dopravy.
