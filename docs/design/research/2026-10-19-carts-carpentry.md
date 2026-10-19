# Vozy, tesař a dřevěné nářadí – podklady

Rešerše k `docs/design/wagons.md` (Tesař, Vůz, Vozová síť), stav 19. 10. 2026. Martin: vozy mají
vozit seno, snopy a klády a nahradit nosiče obchodních výprav; tesař vyrábí vozy, dřevěné nářadí
a zrychlí dřevěné části staveb (citace ve wagons.md).

**Jak číst:** u každého čísla co uvádí literatura, odkud, a co hra použije. Přepočty jsou moje
(**vlastní výpočet**). **Omezení:** přímé raně středověké údaje o nákladu volského vozu, jeho
výrobě, životnosti a o práci tesaře jsem nenašel. Opírám se o moderní tradiční dopravu se
zvířaty (ATNESA, Practical Action, Tillers International), o švýcarský historický slovník
a o pozdější anglické kolářství. Co je jen odhad bez dohledaného zdroje, je označené **(odhad)**.

**Meze `{ worst, best }`** (CLAUDE.md – Meze produktivity) posouvají čísla podle pokrytí
výrobky řemeslníků. Nové meze: dřevěná část práce staveb podle pokrytí tesařem, práce vsi podle
pokrytí dřevěným nářadím a práce tesaře podle pokrytí nástroji od kováře.

---

## 1. Vůz s voly – náklad a rychlost

| Číslo                    | Literatura                                                                                                                                                                                                                                                                                                                                                            | Hra                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Náklad volského vozu     | ATNESA (Starkey a Kaumbutho 1999, tab. 1): **vůz se dvěma voly 900 kg** při 3–4 km/h, dosah 20 km denně – moderní vůz s ocelovou osou a pneumatikami. Nosič na hlavě 30 kg, 4–5 km/h. Raně středověký vůz měl dřevěnou osu a kola bez obručí, voli byli malí (≈ 300 kg – rešerše 2026-10-19-herds-hay-meat.md) a cesty nezpevněné – **(odhad)** polovina: 300–500 kg. | **dvoukolák 400 kg**                |
| Tah                      | Tillers International: dobře krmené spřežení utáhne celý den tah ≈ **10–12 % své váhy**; tah vozu po rovině ≈ **4 % celkové váhy** (pneumatiky, štěrk) až **16 %** (ocelové obruče, pevná půda). Pár volů po 300 kg → trvale ≈ 60–70 kg tahu; dvoukolák ≈ 200 kg + 400 kg nákladu → po louce 10–16 % ≈ 60–100 kg (**vlastní výpočet**) – víc pár trvale neutáhne.     | 400 kg je strop pro pole a louky    |
| Čtyřkolák                | Na upravené cestě tah klesne k ≈ 6–8 % váhy (**odhad** z rozpětí Tillers); čtyřkolák ≈ 350 kg + 800 kg ≈ 70–90 kg tahu – právě na hranici páru. Po louce by ho pár trvale netáhl.                                                                                                                                                                                     | **čtyřkolák 800 kg** (po stezce)    |
| Rychlost                 | Švýcarský historický slovník (Schiedt, „Voitures et chars“): kůň táhne ≈ 4 km/h, vůl „zhruba o třetinu pomaleji“ → **≈ 2,7 km/h**. ATNESA 3–4 km/h (moderní).                                                                                                                                                                                                         | ≈ 3 km/h (wagons.md) – jen do scény |
| Kolik nosičů vůz nahradí | Nosič 30 kg při 4–5 km/h = 0,12 t·km/h; moderní volský vůz 3,5 t·km/h (ATNESA) – ≈ 30×. Raně středověký vůz 400 kg při 2,7 km/h ≈ 1,1 t·km/h ≈ **9 nosičů** v jízdě (**vlastní výpočet**). Nakládka a skládání vidlemi zaberou zhruba polovinu dne vozu – vůz se dvěma lidmi (honák a nakladač) tak za den odveze ≈ tolik jako **8 nosičů** (**odhad**).              | **vůz za den = 8 nosičů, 2 lidé**   |

## 2. Co se vozí – podíl dopravy na práci

| Práce            | Literatura a výpočet                                                                                                                                                                                                                                                                        | Hra (podíl práce, který vůz převezme)  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Snopy z pole     | Hra už dělí sklizeň na žeň a odnos v nůších (`HARVEST_WORK_PER_HA` – 30 → 15 a 20 čd/ha, fields.md); vůz převezme **odnos**.                                                                                                                                                                | odnos (40–57 % sklizně podle nástrojů) |
| Seno z luk       | Rešerše 2026-10-19-herds-hay-meat.md: seč 10–15 čd/ha, z toho svoz a stohování **2–4 čd/ha** (**odhad**) ≈ čtvrtina.                                                                                                                                                                        | **25 %** seče                          |
| Klády ke stavbám | Rešerše 2026-10-17-remesla-drevo-sad.md: kácení a dovoz 2 čd na strom (ruční doprava, sekera); FAO 1987 – kácení, krácení a dovoz jako jeden úkon. Dovoz (vlečení ke staveništi) je zhruba **polovina** (**odhad**); přirážka za vzdálenost (+1 % za 10 m nad 100 m) je skoro celá doprava. | **50 %** kácení a dovozu               |
| Zboží výpravy    | Nosič 25 kg (trade.md); vůz bere místo nosičů 400 / 800 kg, jdou s ním 2 lidé (honák a pomocník). Dobytek se žene jako dřív.                                                                                                                                                                | vůz místo nosičů, 2 lidé na vůz        |
| Kam vůz nedojede | Nosí se jako dřív (wagons.md – anti-cíl). Les jen po vykácené cestě, kládu ke kraji lesa vlečou lidé (**odhad** ≈ 30 m).                                                                                                                                                                    | –                                      |

## 3. Sklon, který vůz vyjede (pro fázi 2 – vozová síť)

| Číslo              | Literatura                                                                                                                                                                                                                                                                 | Návrh                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Žádoucí maximum    | Practical Action (Improving paths and tracks, část 3, obr. 1): pěší a soumaři **12 %** (1 : 8), nosiči s nákladem 10 %, **vozy se zvířaty 8 %** (1 : 12), kola 7 %.                                                                                                        | běžné stoupání vozu do **8 %**                   |
| Krátký prudký úsek | Tah do svahu = sklon × váha vozu navíc (Tillers). Dvoukolák 600 kg při 10 % sklonu chce navíc 60 kg – s valivým odporem ≈ 2× trvalý tah páru; krátce (desítky metrů) to voli zvládnou, dlouhé stoupání ne (**vlastní výpočet**). Nad ≈ 12–15 % už vůz s nákladem nevyjede. | **mez 12 %**, nad 8 % stoupání dráž (serpentiny) |
| Čtyřkolák          | O polovinu těžší vůz – na upravené stezce s menším valivým odporem zvládne podobný sklon jen krátce (**odhad**).                                                                                                                                                           | mez stejná, větší poloměr otáčení (wagons.md)    |

## 4. Výroba vozu a jeho životnost

| Číslo              | Literatura                                                                                                                                                                                                                                                                                                                                                                                                    | Hra                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Pracnost           | Kolář dnes (rekonstrukce, Colonial Williamsburg): loukoťové kolo kočáru ≈ **100 h**, kolečko trakaře 12 h; celý vůz tři lidé ≈ 5 měsíců (s kováním a nátěrem, 18.–19. st.). Raně středověké kolo bez železné obruče a s jednodušším nábojem ≈ polovina kola kočáru – ≈ 5 čd (**odhad**). Dvoukolák = 2 kola, osa, ojnice a jho, korba ≈ 20–30 čd; čtyřkolák = 4 kola, 2 osy, otočný předek, delší korba ≈ 2×. | **dvoukolák 25 čd, čtyřkolák 50 čd**           |
| Dřevo              | Kola a osa z dubu nebo jasanu, korba z prken; strom = velký dospělý strom ≈ 0,7–1,5 m³ (rešerše 2026-10-17). Dvoukolák ≈ 0,3–0,5 m³ hotového dřeva, se ztrátou při štípání a sušení ≈ jeden strom (**odhad**).                                                                                                                                                                                                | **1 kláda / 2 klády**                          |
| Životnost          | Anglický vůz 19. st. „přežil prvního majitele“, první velká oprava po 20–30 letech (The Wheelwright's Shop, Sturt 1923, podle výtahů); vůz se stavěl tak, aby šel opravovat po dílech. Raně středověký vůz s dřevěnou osou a koly bez obručí na nezpevněných cestách vydrží méně – **(odhad)** 8–15 let.                                                                                                      | **10 let**, pak dosloužil a tesař dělá nový    |
| Nástroje od kováře | Sekera, tesla, nebozez a dláto jsou železné; bez nich (kamenné a kostěné nástroje nebo opotřebované železo) je tesařina pomalejší – kvantitativně nenalezeno (rešerše 2026-10-17: Mathieu 2000 jen kvalitativně).                                                                                                                                                                                             | **meze 1,5 → 1** (práce tesaře podle nástrojů) |

## 5. Dřevěné nářadí

| Číslo                  | Literatura                                                                                                                                                                                                                                                                                  | Hra                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Co to je               | Hrábě, vidle (jednodílné z rozštípnutého jasanu nebo ořešáku – Henry Ford Museum, vidle kolem 1870; pozdně středověké vidle s železem – London Museum), dřevěné lopaty, cepy, topůrka a násady (sekery, motyky, srpy), kádě, putny, jha. Váhy ani životnost středověkých kusů jsem nenašel. | –                                  |
| Potřeba na pracujícího | Hrábě ≈ 1 kg, vidle ≈ 1,2 kg, lopata ≈ 1,5 kg, násady 3 × 0,4 kg, podíl cepu, kádí a jha (**odhad**) ≈ 4 kg.                                                                                                                                                                                | **4 kg**                           |
| Opotřebení             | Dřevěné zuby hrábí a násady se lámou, kádě praskají – životnost 2–5 let (**odhad**) ≈ 30 % ročně (jako nástroje kováře).                                                                                                                                                                    | **30 % ročně**                     |
| Výroba                 | Zkušený řemeslník udělá hrábě nebo vidle zhruba za půl dne (**odhad**) ≈ 0,5 čd na kg. Ze stromu (0,5–0,9 t dřeva) po štípání, sušení a opracování zbude jen část – **(odhad)** ≈ 100 kg hotového nářadí.                                                                                   | **0,5 čd na kg, 100 kg ze stromu** |
| Účinek                 | Bez tesaře si vesničané nářadí dělají sami – hůř a častěji ho opravují. Kvantitativně nenalezeno; Martin chce „mírně“ (wagons.md) – **(odhad)** o jednotky procent veškeré práce.                                                                                                           | **meze 1 → 0,95** práce vsi        |

## 6. Tesař na stavbách

| Číslo                      | Literatura                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Hra                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Podíl dřevěné práce staveb | Rekonstrukce raně středověkých staveb (Gyrwe – Jarrow Hall: 31 dubových sloupů a 66 jasanových krokví; Saharna-Ţiglău: ≈ 25 m³ dřeva na dům 9 × 9 m) popisují dřevo jako hlavní část práce vedle výkopu, výpletu, mazanice a došků; rozpis hodin jsem nenašel. **(odhad)** zemnice 40 % (velká jáma), polozemnice 50 %, dvorec 60 % (srub, řezby), ohrada 40 % (pletený plot není tesařina), rádlo 100 %, modla 80 % (řezba), svatyně 30 % (příkop), cesta, hať, lávka a oprava staveb 30 %. | podíl ceny stavby (i s kácením)       |
| Kolik tesař ušetří         | Zkušený tesař rozměří, napojí a otesá trámy bez přeměřování a oprav; kvantitativně nenalezeno. Martin: „díky jeho zkušenostem a umu bude opracování dřevěných částí rychlejší“ – wagons.md navrhl ≈ 40 %.                                                                                                                                                                                                                                                                                    | **meze 1 → 0,6** dřevěné části        |
| Kolik práce tesař pokryje  | Tesařská parta = mistr a 3–4 pomocníci (**odhad** podle pozdějších cechovních part): člověkoden tesaře vede ≈ 4 člověkodny dřevěné práce vsi (i ten svůj).                                                                                                                                                                                                                                                                                                                                   | **1 čd tesaře na 4 čd dřevěné práce** |

## 7. Shrnutí pro hru (návrh Clauda)

- **Dvoukolák** 400 kg, **čtyřkolák** 800 kg (jen na obchod po stezce); vůz za den odveze tolik
  jako **8 nosičů**, jdou s ním **2 lidé** (honák a nakladač) – kde vůz dojede, ušetří 6 čd denně.
- Vůz převezme **odnos snopů**, **čtvrtinu seče** (svoz a stohování) a **polovinu kácení a dovozu**
  klád ke stavbám; obchodní výprava vezme vůz místo nosičů.
- **Výroba:** dvoukolák 25 čd a 1 kláda, čtyřkolák 50 čd a 2 klády; vůz slouží **10 let**.
- **Dřevěné nářadí:** 4 kg na pracujícího, 30 % ročně, 0,5 čd na kg, 100 kg ze stromu; práce vsi
  **1 → 0,95** podle pokrytí.
- **Tesař na stavbách:** dřevěná část práce **1 → 0,6** podle pokrytí tesařem; 1 čd tesaře pokryje
  4 čd dřevěné práce.
- **Nástroje od kováře:** práce tesaře **1,5 → 1** podle pokrytí nástroji.
- **Sklon pro fázi 2:** vůz běžně do **8 %**, mez **12 %**.

## Zdroje

- Starkey, P. – Kaumbutho, P. (eds.) 1999: Meeting the challenges of animal traction. ATNESA,
  Harare – kap. Meeting the challenge of animal-based transport, tab. 1
  ([PDF](https://www.animaltraction.net/challenges/challenges-dennis-transport.pdf)).
- Practical Action: Improving paths and tracks, part 3 – Gradients
  ([text](https://kolibri.teacherinabox.org.au/modules/en-practical_action/Transport%20and%20infrastructure/Road%20building/KnO-100388_Improving%20paths%20and%20tracks%20part%203/page1.html)).
- Tillers International: Estimating Wagon Draft (Tech Guide)
  ([PDF](https://tillersinternational.org/wp-content/uploads/2025/01/EstimatingWagonDraftTechGuide.pdf)) –
  jen výtah vyhledávače (tah 4–16 % váhy vozu, spřežení 10–12 % své váhy).
- Schiedt, H.-U.: Voitures et chars. Dictionnaire historique de la Suisse
  ([online](https://hls-dhs-dss.ch/fr/articles/048993)).
- Colonial Williamsburg: Carriages, Carts and Wagons (podcast, 2007)
  ([online](https://podcast.history.org/2007/09/03/carriages-carts-and-wagons/)) – jen výtah
  (100 h na kolo kočáru, vůz 3 lidé 5 měsíců).
- Sturt, G. 1923: The Wheelwright's Shop. Cambridge – jen výtah (vůz přežil majitele, oprava
  po 20–30 letech).
- Henry Ford Museum: Pitchfork, 1850–1860 ([online](https://www.thehenryford.org/collections/explore/artifact/128122));
  London Museum: Pitchfork, 14.–15. st. ([online](https://londonmuseum.org.uk/collections/v/object-36136/pitchfork)).
- Jarrow Hall: Reconstruction at Gyrwe ([online](https://jarrowhall.com/reconstruction-at-gyrwe-a/));
  EXARC 2009: Reconstructing an Early Iron Age habitat at Saharna-Ţiglău.
- Rešerše hry: 2026-10-17-remesla-drevo-sad.md (strom, kácení a dovoz), 2026-10-19-herds-hay-meat.md
  (seč, svoz, velikost volů).
