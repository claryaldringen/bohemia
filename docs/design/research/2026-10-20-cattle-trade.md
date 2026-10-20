# Krávy, mladí a vycvičení voli – poměry hodnot v raném středověku

_Rešerše k 20. 10. 2026 pro [obchod se sousedy](../trade.md) – Dobytek ve třech druzích (Martin:
„s dobytkem by také mělo jít obchodovat. Představuju si tři kategorie - krávy, mladé voly (musí se
vycvičit) a vycvičené voly“). Krátká rešerše navazuje na
[2026-10-18-trade-values.md](2026-10-18-trade-values.md) (kráva 600 kg obilí). Co se převzalo,
zapisuje trade.md – Dobytek ve třech druzích; čísla jsou v `TRADE_GOOD_VALUES` a `CATTLE_TRADE`
(`packages/game/src/domain/village/rules.ts`)._

**Verdikty:** _sedí_ = prameny hodnotu podporují; _návrh_ = přímý údaj jsem nenašel, číslo je
odhad z poměrů citovaných pramenů. Raně středověké „ceny“ jsou hlavně zákonné sazby (náhrady,
dávky) – ukazují poměry hodnot, ne tržní ceny. U pramenů, ze kterých jsem viděl jen výtah, je to
uvedeno.

## 1. Vůl proti krávě

| Údaj                   | Pramen                                                                                                                                                                 | Zdroj                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ripuárské právo        | Náhrada v naturáliích: vůl rohatý, vidoucí a zdravý 2 solidy, kráva rohatá, vidoucí a zdravá 1 solidus (sazba citovaná v literatuře; plné znění jsem online neověřil). | Lex Ribuaria 36 (40), 11 – ed. Beyerle–Buchner, MGH LL nat. Germ. 3, 2 (1954); jen výtah, jako 18. 10. 2026  |
| Germánské rovnice      | Wergeld 200 solidů = 100 volů – vůl ≈ 2 solidy (stejný poměr jako ripuárská sazba).                                                                                    | Seebohm, _Tribal Custom in Anglo-Saxon Law_ (výtah); Wikipedia – Weregild                                    |
| Anglie, pol. 14. stol. | Vůl ≈ 13 s. 1¼ d., kráva ≈ 9 s. 5 d. (kráva 1285–1290 ≈ 6 s.) – vůl ≈ 1,4× kráva.                                                                                      | K. Hodges, _Late-Medieval English Prices_ (kompilace z Dyera a Jusseranda, sám autor ji uvádí jako neúplnou) |
| Údržba tažného zvířete | Roční náklad na vola ≈ 7 s. 2¾ d., na tažného koně ≈ 10 s. 2 d. (Langdon) – vůl je levnější a má i hodnotu na maso.                                                    | Langdon, _Horses, Oxen and Technological Innovation_ (1986), výtah                                           |

**Vycvičený vůl ≈ 2 krávy → 1 200 kg obilí** (_sedí_ – raně středověké sazby dávají 2×, pozdní
anglické ceny 1,4×; vybral jsem raný poměr, protože hra je v raném středověku a vycvičený vůl ve vsi
bez koní je nejcennější kus).

## 2. Mladý vůl (tele před výcvikem)

| Údaj                | Pramen                                                                                                                         | Zdroj                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Sasové 797          | Roční vůl obojího pohlaví, jak jde na podzim do chléva, 1 solidus; na jaře, když z chléva jde, také 1; pak cena roste s věkem. | Capitulare Saxonicum 797, c. 11 (Fordham Medieval Sourcebook – „Carolingian money“) |
| **Vlastní výpočet** | Saský solidus ≈ 750–1 000 kg obilí, franský ≈ 150–200 kg; roček tedy ≈ 1 solidus = kráva ve franských zákonících.              | –                                                                                   |

**Mladý vůl 350 kg obilí** (_návrh_): roček stojí v saském kapituláři stejně jako kráva ve
franských zákonících, ale ve hře je ještě 2 roky jen krmit a cvičit; kráva přitom hned dává mléko
a telata. Mezi krávou (600) a vycvičeným volem (1 200) je tak mladý vůl spíš blíž ceně masa
(vůl ≈ 120 kg masa × 3 kg obilí = 360 kg).

## 3. Cena výcviku (mezi mladým a vycvičeným volem)

| Položka               | Odhad                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| Seno na 2 zimy        | 6 kg denně × 151 dní × 2 = ≈ 1,8 t sena (dávka vola ve hře – oxen.md, Seno)                               |
| Pastva a pasák v létě | pasou výrostci – ves to práci nestojí (diet.md – Pasáci), sousedovi ano                                   |
| Výcvik                | 2 roky zápřahu s honákem – desítky člověkodní; riziko úhynu a nepovedeného vola                           |
| **Rozdíl v ceně**     | 1 200 − 350 = **850 kg obilí** – seno (≈ 0,2–0,3 kg obilí za kg sena) a práce výcviku s rizikem (_návrh_) |

## 4. Vycvičený vůl ze sousedství – kolik služby má za sebou

**3 roky z 10** (_návrh_, `CATTLE_TRADE.servedYears`): soused prodá vola, kterého už má vycvičeného
a nějaký čas zapřaženého (ověřený tah), ne nejmladšího; ves ho má ještě 7 let. Dosluhujícího vola
(posledních 2 let služby) ves sousedovi neprodá – soused by ho nekoupil za cenu tažného vola.

## Zdroje

- [Capitulary of Aix-la-Chapelle on the Value of Commodities, 797 (Fordham Medieval Sourcebook)](https://sourcebooks.web.fordham.edu/source/750caroling-money.asp)
- [Late-Medieval English Prices (K. Hodges)](https://mseffie.com/assignments/canterbury_tales/medieval_prices.html)
- [Weregild (Wikipedia)](https://en.wikipedia.org/wiki/Weregild)
- [Langdon, Horses, oxen and technological innovation (Birmingham, 1983 – disertace)](https://etheses.bham.ac.uk/id/eprint/14029)
- [Horses vs oxen in medieval times (Medievalists.net)](https://www.medievalists.net/2023/02/horse-ox-medieval-times/)
- Lex Ribuaria, ed. F. Beyerle a R. Buchner, MGH Leges nationum Germanicarum 3, 2 (Hannover 1954) – sazba citovaná z literatury, viz [2026-10-18-trade-values.md](2026-10-18-trade-values.md)
