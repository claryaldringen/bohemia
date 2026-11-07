# Bohemia – vize

Stav k 16. 10. 2026, Hráči a vazalství k 2. 11. 2026 (sjednoceno s rozhodnutími Martina). Dokument zachycuje, na čem jsme se zatím
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
  jistou výhodu.“ Svět je **síť dohod** – hráč smí být vazalem víc pánů (Martin 2. 11. 2026:
  „vazalství není pevně daný vztah – žádné herní pravidlo nenutí vazalství dodržet“); zakázané
  je jen vzájemné vazalství dvou hráčů.
- **Nový hráč bez pozvánky je nezávislý** – Martin 2. 11. 2026: „Bude úplně nezávislý – buď svou
  nezávislost uhájí nebo ho některý z ostatních hráčů donutí stát se jeho vazalem.“ (Dřív zde
  stálo „automaticky se stane vazalem některého ze stávajících hráčů“ – zrušeno.)
- **Vazalem se hráč stane dohodou** – Martin 2. 11. 2026: „Hráč navrhne jinému hráči, aby se
  stal jeho vazalem a stanoví podmínky. Druhý hráč to buď přijme, odmítne nebo se bude jednat
  o podmínkách.“ O přijetí smí požádat i budoucí vazal; návrh nepropadá. Podrobení silou – výzva
  k válce je nabídka vazalství ([válka](war.md)).
- **Hlavní věc vazalství je vojenská služba** mužů rodu vazala (Martin 2. 11. 2026: „Bude to hlavní
  věc na vazalství.“). **Dávky** z makrokomodit (obilí, seno, dobytek, koně, klády, lidé, práce)
  nabízí vazal podle toho, kolik může postrádat, a jednou ročně (1. 11.) je potvrdí – míň, víc,
  se vzkazem. Pán pomáhá a chrání **na žádost** – dar nebo půjčka.
- **Nic se nevynucuje** – válka mezi vazaly ani s pánem není zakázaná; neplnícího vazala pán
  přinutí k poslušnosti, nebo mu vazalství vypoví; spory rozsoudí pán (Martin 2. 11. 2026).
- Vazalství není navždy: kterákoli strana ho smí **formálně vypovědět** a platí to hned
  (Martin 2. 11. 2026); smrt vojvody ho nekončí. Vymře-li rod, který má pána, rozhoduje pán o jeho
  vsích a vazalech jako o **odúmrti**.
- **Hráč smí řídit víc vsí** – ves má držitele (rod), vojvodu a správce (šlechtice); hráč řídí
  každou ves, kde je vojvodou nebo správcem, i cizí ves jako pánův vazal (Martin 2. 11. 2026).
- Pozvat hráče se vyplácí – pán získá vazala a za každého pozvaného hráče jedno nástupnictví bez
  losu ([seniorát](seniorate.md); Martin 2. 11. 2026).
- **Návrh ke schválení** (sjednocený s rozhodnutími 2. 11. 2026):
  [vazalství a pozvánky](vassalage.md) – pozvánkový kód, nezávislý nováček, jednání, dávky,
  služby, povinnosti pána, mír a spory, konec a odúmrť, správce a tři role ve vsi; souvisí
  s [seniorátem](seniorate.md) a [válkou](war.md).

## Rozhodnutí

| Rozhodnutí                                                                                                                                                                         | Kdo                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Hra v prohlížeči, jméno Bohemia, spuštění 1. 1. 2027                                                                                                                               | Martin                                         |
| Roky 500–1500 za jeden skutečný rok, plynou dny a roční období                                                                                                                     | Martin                                         |
| Registrace, sdílený svět, vazalství přes pozvánky                                                                                                                                  | Martin                                         |
| Kód na GitHubu (veřejné repo), později běh na vlastním Hetzner VPS                                                                                                                 | Martin                                         |
| Zatím se vyvíjí a běží jen lokálně, nasazení až později                                                                                                                            | Martin                                         |
| Databáze PostgreSQL (na Hetzneru už běží)                                                                                                                                          | Martin                                         |
| Rod jako hlavní postava, vazalství není trvalé                                                                                                                                     | návrh Clauda, Martin potvrdil                  |
| Na začátku nikdo nahoře, hráč bez pozvánky nezávislý, vazalství jako síť dohod, vojenská služba a dávky, vypovězení hned, odúmrť, hráč řídí víc vsí ([vassalage.md](vassalage.md)) | Martin (2. 11. 2026), podrobnosti návrh Clauda |
| Seniorát: ne-senior se jen dívá, los nástupce ½, za každého pozvaného jedno nástupnictví bez losu ([seniorate.md](seniorate.md))                                                   | Martin (2. 11. 2026), podrobnosti návrh Clauda |
| Stack: Turborepo, Next.js, TypeScript, Drizzle, PM2 + Caddy                                                                                                                        | návrh Clauda                                   |
| Herní kalendář: juliánský, roční období podle měsíců, datum malé v rohu ([calendar.md](calendar.md))                                                                               | návrh Clauda, Martin schválil                  |
| Obyvatelstvo a obydlí vesnice: domácnosti, růst, stavby hráče, přestavby obyvateli ([population.md](population.md))                                                                | Martin, čísla návrh Clauda                     |
| Pole a jídlo: společná pole vsi, přílohová soustava, ruční práce, zásoby a nasycení ([fields.md](fields.md))                                                                       | Martin, čísla návrh Clauda                     |
| Hřbitov: poloha a velikost ovlivňují úmrtnost, bez ukazatele hygieny ([cemetery.md](cemetery.md))                                                                                  | Martin, čísla návrh Clauda                     |
| Les a dřevo: palivo sbírají vesničané, kácí se na stavby, klády z mýcení ([forest.md](forest.md))                                                                                  | Martin, čísla návrh Clauda                     |
| Jabloňový sad: staví se po čtvercích jako pole, plodí od 6. roku ([orchard.md](orchard.md))                                                                                        | Martin, čísla návrh Clauda                     |
| Štěstí obyvatel a posvátná místa – duby, háje, modla, svatyně ([happiness.md](happiness.md))                                                                                       | Martin, čísla návrh Clauda                     |
| Orání rádlem – voli z vlastních telat, ohrada s přístřeškem, seno ([oxen.md](oxen.md))                                                                                             | Martin, čísla návrh Clauda                     |
| Strava z obilí, masa a ovoce; dobytek jako zdroj masa ([diet.md](diet.md))                                                                                                         | Martin, čísla návrh Clauda                     |
| Hlad zabíjí, ves může vymřít; komu vymřou všechny vsi, začíná znovu ([population.md](population.md))                                                                               | Martin, čísla návrh Clauda                     |
| Nabídka hry (F10): začít znovu jde i se živou vsí, po potvrzení ([population.md](population.md))                                                                                   | Martin                                         |
| Prémiové krajiny lidských hráčů, NPC průměrná krajina, kostra světa ([premium-landscapes.md](premium-landscapes.md))                                                               | Martin, podrobnosti návrh Clauda               |
| Výrobní řetězy – celý postup práce vidět, kovář a hřivny, humno, obilné jámy ([production-chains.md](production-chains.md))                                                        | Martin, podrobnosti návrh Clauda               |
| Hexagonální architektura (porty a adaptéry), hranice hlídá ESLint                                                                                                                  | návrh Clauda, Martin schválil                  |
| UI česky, kód anglicky                                                                                                                                                             | návrh Clauda                                   |
| Herní čas jako čistá funkce skutečného času, pravidla v `packages/game`, server je autorita                                                                                        | návrh Clauda                                   |

## Otevřené otázky

Mechaniky probereme postupně. Zatím nerozhodnuto:

1. ~~**Vrchol hierarchie**~~ – rozhodnuto 2. 11. 2026 (Martin): na začátku nahoře nestojí
   nikdo, všichni jsou si rovni; na vrchol se dostane, kdo si podrobí ostatní.
2. ~~**Přidělení pána hráči bez pozvánky**~~ – rozhodnuto 2. 11. 2026 (Martin): nic se
   nepřiděluje, hráč bez pozvánky je nezávislý.
3. **Změny vazalství** – rozhodnuto 2. 11. 2026 (Martin): vazalem se hráč stane jednáním,
   kterákoli strana vypoví hned, neplnění řeší pán, vymření rodu s pánem = odúmrť
   ([vazalství](vassalage.md)). Podrobení silou – s [válkou](war.md).
4. **Povinnosti pána a vazala** – rozhodnuto 2. 11. 2026 (Martin): vojenská služba mužů rodu,
   dávky z makrokomodit podle výhledu vazala, pomoc a ochrana na žádost, rozsudek pána
   ([vazalství](vassalage.md)); otevřené zbývají podrobnosti tam.
5. **Smrt, dědictví a nástupnictví** – co když rod vymře? Co když hráč dlouho není online a
   mezitím uběhnou generace? (Zčásti rozhodnuto: když hráči vymřou všechny vesnice, hra pro něj
   končí a začíná znovu; začít znovu může i sám z nabídky hry – Martin, 18. 10. 2026,
   [populace](population.md).)
6. **Hospodářství a stavby** – suroviny, obyvatelstvo, postup vesnice → hradiště → tvrz → hrad
   → město.
7. ~~**Prestiž**~~ – rozhodnuto 7. 11. 2026 (Martin): „Prestiž nebude herní veličina.“
8. **Válka, diplomacie a sňatky** mezi rody hráčů – válka je návrh ke schválení
   ([válka](war.md)); obchod mezi hráči jednáním rozhodnut 2. 11. 2026, sňatky v další verzi
   (Martin – [vazalství](vassalage.md)).
9. **Mapa** – historické Čechy? Jak velká a jak podrobná?
10. ~~**Pozdní příchozí**~~ – rozhodnuto 7. 11. 2026 (Martin): začíná stavbou vsi; s pozvánkou
    vazal, jinak si vybere pána z nejmenších rodů nad sebou, nebo začne svobodný u své jazykové
    skupiny ([vstup do světa](newcomers.md)).
11. **Konec světa** – co nastane v roce 1500: vyhodnocení, nový svět?
12. **Historická věrnost vs. hratelnost** – v roce 500 v Čechách ještě feudální struktury nejsou.
