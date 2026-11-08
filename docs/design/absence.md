# Dlouhá nepřítomnost hráče

Stav: **rozhodnuto 8. 11. 2026** (Martin, po bodech níž). Podrobnosti jsou návrh Clauda.

Hráč, který dva týdny nehraje, prožije ≈ 40 herních let – víc než generaci. Svět běží dál, worker
vsi dopočítává ([worker](../code/worker.md)), ves bez správce žije podle pravidel vesničanů a
správce se sám nezapne (Martin 8. 11. 2026: „Ne, správce se sám nezapne. Ves by měla nějakým
způsobem mírně růst nebo i stagnovat bez něj.“). Nástupnictví a vymření rodu řeší
[vojvodova rodina](lord.md) a [seniorát](seniorate.md).

## Jména synů

- Syn, kterému hráč **do jednoho herního roku** od narození nedá jméno, dostane **jméno obvyklé
  v rodě** – Martin 8. 11. 2026: „Ať dostane nějaké jméno obvyklé v rodě, např. po dědečkovi nebo
  strýci. Pokud by žádné takové nebylo, ať se vygeneruje.“
- Pořadí (návrh Clauda): dědeček z otcovy strany → strýc (otcův bratr) → praděd po meči →
  jiný muž rodu; jméno, které v rodě právě nese žijící muž ve stejné vsi, se přeskočí. Nic
  takového → vygenerované jméno jako u vnuků ([vojvodova rodina](lord.md) – Generovaná jména
  vnuků). Volba je deterministická (seed vsi a dne).
- Hráč smí jméno později přepsat stejně jako dnes (návrh Clauda).

## Povinnosti vazala, když hráč nehraje

Martin 8. 11. 2026: „ano“ – za nepřítomného hráče jedná jeho **formální správce** (nejstarší syn
od 16 let, bez něj vojvoda – [správce](steward.md) – Správce je šlechtic) podle dohodnutých
podmínek:

- **Roční potvrzení dávek:** neodpoví-li hráč do lhůty, potvrdí se dávky jako loni; nemá-li na ně
  ves, odvede, co může, a pán to vidí jako neplnění ([vazalství](vassalage.md)).
- **Svolání:** neodpoví-li hráč do lhůty, pošle správce dohodnuté muže, kteří jsou doma a zdraví
  (stejně jako NPC rod – `answerNpcSummons`).
- **Nová jednání** čekají na hráče; bez odpovědi do lhůty vyprší (návrh Clauda: 1 herní rok).

## Návrat

Žádné zvláštní shrnutí – Martin 8. 11. 2026: „Ne, může si přece sám zobrazit panel s notifikacemi
a kroniku.“

## Opuštěný rod

Martin 8. 11. 2026: „A“ – rod hráče, který měsíce nehraje, **zůstane ve světě napořád**: žije jen
podle pravidel vesničanů, ostatní ho smějí podrobit nebo vyplenit jako kohokoli; když vymře,
zanikne a jeho vsi připadnou podle odúmrti ([vazalství](vassalage.md)). Žádné zvláštní pravidlo
nečinnosti.

## Zátěž serveru

Martin 8. 11. 2026: „A“ – ves hráče, který nehraje **déle než 3 skutečné dny** (návrh Clauda),
se **uspí**: worker ji průběžně nepočítá a dopočítá ji, až se jí něco dotkne (hráč se vrátí,
nájezd, obchod, dávky, rozvoz jídla domény, pohled jiného hráče). Výsledek je díky determinismu
**stejný** jako při průběžném výpočtu (výsledek nezávisí na kouscích dopočtu); jen server ušetří
práci. Plánované události, které se dějí bez dotyku (svolání, roční potvrzení dávek, nástupnictví),
si ves dopočítá při jejich kroku světa.
