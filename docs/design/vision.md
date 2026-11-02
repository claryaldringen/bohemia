# Bohemia – vize

Stav k 16. 10. 2026, Hráči a vazalství k 2. 11. 2026. Dokument zachycuje, na čem jsme se zatím
shodli. Herní mechaniky se budou navrhovat postupně, každá ve vlastním dokumentu
v `docs/design/`.

## Co je Bohemia

Dlouhodobá online strategie v prohlížeči z českého prostředí let 500–1500. Hráč je feudální pán,
přesněji hlava rodu. Buduje vesnice, hradiště, tvrze, hrady a města. Snaží se co nejvíc rozšířit
rodový majetek a prestiž a hlavně **zachovat rod**.

Všichni hráči žijí v jednom společném světě a musí spolu jednat. Spojuje je feudální hierarchie
pán–vazal.

## Čas

- Svět startuje **1. 1. 2027 v 00:00 pražského času** v roce 500.
- Tisíc let proběhne za jeden skutečný rok: 1. 1. 2028 v 00:00 je 1. 1. roku 1500.
- Svět běží nepřetržitě i bez přihlášených hráčů. Plynou dny a střídají se roční období.

Orientační převody: herní den ≈ 86 s, roční období ≈ 2 h 11 min, herní rok ≈ 8 h 46 min,
generace (~25 let) ≈ 9 skutečných dní, lidský život ≈ 2–3 týdny.

Z toho plyne, že hráč za rok hraní vystřídá kolem 40 generací. Skutečnou postavou hráče je rod,
ne jeden pán.

## Hráči a vazalství

- Hráč se musí zaregistrovat a přihlásit.
- Stávající hráč může pozvat nového hráče unikátním kódem. Pozvaný začíná jako vazal toho, kdo
  ho pozval (Martin 2. 11. 2026: „Ano, začíná jako vazal“).
- **Na začátku na vrcholu nestojí nikdo** – Martin 2. 11. 2026: „Na začátku na vrcholu nestojí
  nikdo. Všichni hráči jsou si rovni a pokud se chce někdo dostat na vrchol, musí si nějakým
  způsobem podrobit ostatní. V tom ta hra vlastně spočívá. Ano – ti co začali dříve, budou mít
  jistou výhodu.“ Svět je tedy **les stromů vazalství** – každý nezávislý hráč je kořen svého
  stromu.
- **Nový hráč bez pozvánky je nezávislý** – Martin 2. 11. 2026: „Bude úplně nezávislý – buď svou
  nezávislost uhájí nebo ho některý z ostatních hráčů donutí stát se jeho vazalem.“ (Dřív zde
  stálo „automaticky se stane vazalem některého ze stávajících hráčů“ – zrušeno.)
- **Vazalem se hráč stane dohodou** – Martin 2. 11. 2026: „Hráč navrhne jinému hráči, aby se
  stal jeho vazalem a stanoví podmínky. Druhý hráč to buď přijme, odmítne nebo se bude jednat
  o podmínkách.“ „O dávkách rozhoduje pán.“ Podrobení silou přijde s válkou.
- Vazalství není navždy: vazal smí odejít **kdykoli** (Martin 2. 11. 2026), pán ho smí propustit;
  vzpoura až s válkou.
- Pozvat hráče se vyplácí – pán získá vazala a za každého pozvaného hráče jedno nástupnictví bez
  losu ([seniorát](seniorate.md); Martin 2. 11. 2026).
- **Návrh první verze ke schválení** (přepracováno podle odpovědí 2. 11. 2026):
  [pozvánky a vazalství](vassalage.md) – pozvánkový kód, nezávislý nováček, nabídka vazalství
  s podmínkami a jednání, dávka, pomoc v nouzi a dar, odchod kdykoli; souvisí
  s [seniorátem](seniorate.md) (nástupnictví hráče).

## Rozhodnutí

| Rozhodnutí                                                                                                                                | Kdo                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Hra v prohlížeči, jméno Bohemia, spuštění 1. 1. 2027                                                                                      | Martin                                         |
| Roky 500–1500 za jeden skutečný rok, plynou dny a roční období                                                                            | Martin                                         |
| Registrace, sdílený svět, vazalství přes pozvánky                                                                                         | Martin                                         |
| Kód na GitHubu (veřejné repo), později běh na vlastním Hetzner VPS                                                                        | Martin                                         |
| Zatím se vyvíjí a běží jen lokálně, nasazení až později                                                                                   | Martin                                         |
| Databáze PostgreSQL (na Hetzneru už běží)                                                                                                 | Martin                                         |
| Rod jako hlavní postava, vazalství není trvalé                                                                                            | návrh Clauda, Martin potvrdil                  |
| Na začátku nikdo nahoře, hráč bez pozvánky nezávislý, vazalství nabídkou s podmínkami pána, odchod kdykoli ([vassalage.md](vassalage.md)) | Martin (2. 11. 2026), podrobnosti návrh Clauda |
| Seniorát: ne-senior se jen dívá, los nástupce ½, za každého pozvaného jedno nástupnictví bez losu ([seniorate.md](seniorate.md))          | Martin (2. 11. 2026), podrobnosti návrh Clauda |
| Stack: Turborepo, Next.js, TypeScript, Drizzle, PM2 + Caddy                                                                               | návrh Clauda                                   |
| Herní kalendář: juliánský, roční období podle měsíců, datum malé v rohu ([calendar.md](calendar.md))                                      | návrh Clauda, Martin schválil                  |
| Obyvatelstvo a obydlí vesnice: domácnosti, růst, stavby hráče, přestavby obyvateli ([population.md](population.md))                       | Martin, čísla návrh Clauda                     |
| Pole a jídlo: společná pole vsi, přílohová soustava, ruční práce, zásoby a nasycení ([fields.md](fields.md))                              | Martin, čísla návrh Clauda                     |
| Hřbitov: poloha a velikost ovlivňují úmrtnost, bez ukazatele hygieny ([cemetery.md](cemetery.md))                                         | Martin, čísla návrh Clauda                     |
| Les a dřevo: palivo sbírají vesničané, kácí se na stavby, klády z mýcení ([forest.md](forest.md))                                         | Martin, čísla návrh Clauda                     |
| Jabloňový sad: staví se po čtvercích jako pole, plodí od 6. roku ([orchard.md](orchard.md))                                               | Martin, čísla návrh Clauda                     |
| Štěstí obyvatel a posvátná místa – duby, háje, modla, svatyně ([happiness.md](happiness.md))                                              | Martin, čísla návrh Clauda                     |
| Orání rádlem – voli z vlastních telat, ohrada s přístřeškem, seno ([oxen.md](oxen.md))                                                    | Martin, čísla návrh Clauda                     |
| Strava z obilí, masa a ovoce; dobytek jako zdroj masa ([diet.md](diet.md))                                                                | Martin, čísla návrh Clauda                     |
| Hlad zabíjí, ves může vymřít; komu vymřou všechny vsi, začíná znovu ([population.md](population.md))                                      | Martin, čísla návrh Clauda                     |
| Nabídka hry (F10): začít znovu jde i se živou vsí, po potvrzení ([population.md](population.md))                                          | Martin                                         |
| Prémiové krajiny lidských hráčů, NPC průměrná krajina, kostra světa ([premium-landscapes.md](premium-landscapes.md))                      | Martin, podrobnosti návrh Clauda               |
| Výrobní řetězy – celý postup práce vidět, kovář a hřivny, humno, obilné jámy ([production-chains.md](production-chains.md))               | Martin, podrobnosti návrh Clauda               |
| Hexagonální architektura (porty a adaptéry), hranice hlídá ESLint                                                                         | návrh Clauda, Martin schválil                  |
| UI česky, kód anglicky                                                                                                                    | návrh Clauda                                   |
| Herní čas jako čistá funkce skutečného času, pravidla v `packages/game`, server je autorita                                               | návrh Clauda                                   |

## Otevřené otázky

Mechaniky probereme postupně. Zatím nerozhodnuto:

1. ~~**Vrchol hierarchie**~~ – rozhodnuto 2. 11. 2026 (Martin): na začátku nahoře nestojí
   nikdo, všichni jsou si rovni; na vrchol se dostane, kdo si podrobí ostatní.
2. ~~**Přidělení pána hráči bez pozvánky**~~ – rozhodnuto 2. 11. 2026 (Martin): nic se
   nepřiděluje, hráč bez pozvánky je nezávislý.
3. **Změny vazalství** – zčásti rozhodnuto 2. 11. 2026 (Martin): vazal odejde kdykoli, vazalem se
   hráč stane přijetím nabídky. Zbývá vzpoura a podrobení silou – s [válkou](war.md).
4. **Povinnosti pána a vazala** – zčásti rozhodnuto 2. 11. 2026 (Martin: „O dávkách rozhoduje
   pán“): podmínky stanoví pán v nabídce. Návrh první verze: dávka, pomoc v nouzi a dar –
   [vazalství](vassalage.md); vojenská služba a ochrana s válkou.
5. **Smrt, dědictví a nástupnictví** – co když rod vymře? Co když hráč dlouho není online a
   mezitím uběhnou generace? (Zčásti rozhodnuto: když hráči vymřou všechny vesnice, hra pro něj
   končí a začíná znovu; začít znovu může i sám z nabídky hry – Martin, 18. 10. 2026,
   [populace](population.md).)
6. **Hospodářství a stavby** – suroviny, obyvatelstvo, postup vesnice → hradiště → tvrz → hrad
   → město.
7. **Prestiž** – jak vzniká a k čemu slouží.
8. **Válka, diplomacie a sňatky** mezi rody hráčů.
9. **Mapa** – historické Čechy? Jak velká a jak podrobná?
10. **Pozdní příchozí** – jak se zapojí hráč, který přijde třeba v roce 1200?
11. **Konec světa** – co nastane v roce 1500: vyhodnocení, nový svět?
12. **Historická věrnost vs. hratelnost** – v roce 500 v Čechách ještě feudální struktury nejsou.
