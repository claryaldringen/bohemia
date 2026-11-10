// Víra a křesťanství (číselná pravidla; návrh: docs/design/christianity.md).

export const FAITH = {
  // christianity.md – Objev křesťanství: roční šance p(rok) = a × (e^(k × (rok − fromYear)) − 1)
  discovery: { a: 0.0000518, k: 0.0185, fromYear: 500 },
  // christianity.md – Víra vesničanů (Obrácení): roční šance dospělého pohana, × (1 + podíl křesťanů)
  conversion: { withoutChurch: 0.005, withChurch: 0.03 },
  // christianity.md – Víra vesničanů (Štěstí): nespokojenost pohanů za zničená posvátná místa
  desecration: { oakOrGrove: 15, cemetery: 20, max: 30 },
  // christianity.md – Víra vesničanů (Štěstí): kostel přidá křesťanům jako posvátná místa (strop)
  churchHappiness: 40,
  // christianity.md – Křest rodu: NPC rod se pokřtí 1–20 let po objevu
  npcBaptismYears: { min: 1, max: 20 },
  // christianity.md – Co křest rodu umožní: hřbitov nepoužívaný tolik let smí pokřtěný rod zaorat
  cemeteryUnusedYears: 10,
} as const;
