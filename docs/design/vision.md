# Bohemia – vize

Stav k 16. 10. 2026. Dokument zachycuje, na čem jsme se zatím shodli. Herní mechaniky se budou
navrhovat postupně, každá ve vlastním dokumentu v `docs/design/`.

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
  ho pozval.
- Nový hráč bez pozvánky se automaticky stane vazalem některého ze stávajících hráčů. Podle čeho,
  určí herní mechanika (zatím nenavržena).
- Svět je tedy strom vazalství a někdo stojí na jeho vrcholu.
- Vazalství není navždy: vazalové se mohou osamostatnit, vzbouřit nebo přísahat jinému pánovi.
- Pozvat hráče se vyplácí – pán získá vazala, a tedy moc.

## Rozhodnutí

| Rozhodnutí                                                                                           | Kdo                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| Hra v prohlížeči, jméno Bohemia, spuštění 1. 1. 2027                                                 | Martin                        |
| Roky 500–1500 za jeden skutečný rok, plynou dny a roční období                                       | Martin                        |
| Registrace, sdílený svět, vazalství přes pozvánky                                                    | Martin                        |
| Kód na GitHubu (veřejné repo), později běh na vlastním Hetzner VPS                                   | Martin                        |
| Zatím se vyvíjí a běží jen lokálně, nasazení až později                                              | Martin                        |
| Databáze PostgreSQL (na Hetzneru už běží)                                                            | Martin                        |
| Rod jako hlavní postava, vazalství není trvalé                                                       | návrh Clauda, Martin potvrdil |
| Stack: Turborepo, Next.js, TypeScript, Drizzle, PM2 + Caddy                                          | návrh Clauda                  |
| Herní kalendář: juliánský, roční období podle měsíců, datum malé v rohu ([calendar.md](calendar.md)) | návrh Clauda, Martin schválil |
| UI česky, kód anglicky                                                                               | návrh Clauda                  |
| Herní čas jako čistá funkce skutečného času, pravidla v `packages/game`, server je autorita          | návrh Clauda                  |

## Otevřené otázky

Mechaniky probereme postupně. Zatím nerozhodnuto:

1. **Vrchol hierarchie** – kdo stojí nahoře na začátku: první hráči, Martin, nebo nehráčský
   panovník?
2. **Přidělení pána hráči bez pozvánky** – podle čeho?
3. **Změny vazalství** – jak se lze osamostatnit, vzbouřit nebo přejít k jinému pánovi.
4. **Povinnosti pána a vazala** – odvody, vojenská služba, ochrana.
5. **Smrt, dědictví a nástupnictví** – co když rod vymře? Co když hráč dlouho není online a
   mezitím uběhnou generace?
6. **Hospodářství a stavby** – suroviny, obyvatelstvo, postup vesnice → hradiště → tvrz → hrad
   → město.
7. **Prestiž** – jak vzniká a k čemu slouží.
8. **Válka, diplomacie a sňatky** mezi rody hráčů.
9. **Mapa** – historické Čechy? Jak velká a jak podrobná?
10. **Pozdní příchozí** – jak se zapojí hráč, který přijde třeba v roce 1200?
11. **Konec světa** – co nastane v roce 1500: vyhodnocení, nový svět?
12. **Historická věrnost vs. hratelnost** – v roce 500 v Čechách ještě feudální struktury nejsou.
