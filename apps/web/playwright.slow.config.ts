import base from './playwright.config';
// Dočasné (necommitovat): pod velkou zátěží build trvá přes 4 minuty.
const webServer = base.webServer as unknown as Record<string, unknown>;
export default { ...base, webServer: { ...webServer, timeout: 1_200_000 } };
