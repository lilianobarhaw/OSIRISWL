// Les Mécènes et la communauté : rangs des Mécènes, mot du jour, et le décompte de l'ouverture.
//
// Rangs (lib/rangs.js)
// - Chaque nuit, automatiquement : Vercel appelle cette adresse (vercel.json → crons) avec la variable CRON_SECRET.
// - À la main : https://<ton-site>/api/rangs?key=<SETUP_KEY>
// - Pour voir ce qui changerait sans rien toucher : ajouter &simulation=1
//
// Mot du jour (lib/mot.js) : /api/rangs?mot=1 (la page /mot).
// Les écrans (lib/ecrans.js) : /api/rangs?ecrans=1&c=… (qui est en direct sur Twitch, pour l'accueil).
// La Bourse (lib/cote.js) : /api/bourse → /api/rangs?bourse=1 (les cours du bandeau, rien avant /cote bandeau).
// L'onglet La Cote (lib/cote.js) : /api/rangs?cote=1 en GET (cours, portefeuille, vote) et en POST (acheter, vendre, voter).
// Les Offrandes à l'écran (lib/offrande.js) : /api/rangs?offrande=1 en GET (le vote en cours) et en POST (voter depuis le site).
// La Sélection (lib/selection.js) : /api/selection → /api/rangs?selection=1 (les noms déjà annoncés, pour l'écran).
// Cron de 21 h : /api/rangs?tick=1 → l'annonce du mot de la veille, le salon du décompte (lib/decompte.js),
// et la Cote (vote fermé à l'heure → calcul ; le dimanche, les 3 plus grandes fortunes).
// Le cron de la nuit renomme aussi le salon du décompte.
// Ils passent par ici parce que le site est au maximum de 12 fonctions sur l'offre gratuite de Vercel.

import { env, json, optEnv } from "../lib/discord.js";
import { mettreAJourRangs } from "../lib/rangs.js";
import { motGET, motPOST, publierMot } from "../lib/mot.js";
import { majSalon } from "../lib/decompte.js";
import { ecransGET } from "../lib/ecrans.js";
import { bourseGET, siteGET as coteGET, sitePOST as cotePOST, tick as coteTick } from "../lib/cote.js";
import { selectionGET } from "../lib/selection.js";
import { offrandeGET, offrandePOST, cloturerSiBesoin } from "../lib/offrande.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("ecrans")) return ecransGET(req);
  if (url.searchParams.has("bourse")) return bourseGET(req);
  if (url.searchParams.has("cote")) return coteGET(req);
  if (url.searchParams.has("offrande")) return offrandeGET(req);
  if (url.searchParams.has("selection")) return selectionGET(req);
  if (url.searchParams.has("mot")) return motGET(req);
  if (url.searchParams.has("tick")) {
    const mot = await publierMot().catch((e) => ({ annonce: false, erreur: e.message }));
    const decompte = await majSalon().catch((e) => ({ erreur: e.message }));
    const cote = await coteTick().catch((e) => ({ erreur: e.message }));
    const offrande = await cloturerSiBesoin().catch((e) => ({ erreur: e.message }));
    return json({ ok: true, mot, decompte, cote, offrande }, 200, { "Cache-Control": "no-store" });
  }

  const cron = optEnv("CRON_SECRET");
  const parCron = !!cron && req.headers.get("authorization") === `Bearer ${cron}`;
  const parCle = url.searchParams.get("key") === env("SETUP_KEY");
  if (!parCron && !parCle) return json({ error: "Clé invalide" }, 403);
  try {
    const simulation = url.searchParams.get("simulation") === "1";
    const rapport = await mettreAJourRangs({ simulation });
    const decompte = simulation ? null : await majSalon().catch((e) => ({ erreur: e.message }));
    return json({ ok: true, ...rapport, decompte }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function POST(req) {
  const q = new URL(req.url).searchParams;
  if (q.has("mot")) return motPOST(req);
  if (q.has("cote")) return cotePOST(req);
  if (q.has("offrande")) return offrandePOST(req);
  return json({ error: "Méthode non autorisée" }, 405);
}
