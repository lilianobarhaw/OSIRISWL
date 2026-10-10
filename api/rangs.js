// Les Mécènes : leurs rangs, et le vote du jour.
//
// Rangs (lib/rangs.js)
// - Chaque nuit, automatiquement : Vercel appelle cette adresse (vercel.json → crons) avec la variable CRON_SECRET.
// - À la main : https://<ton-site>/api/rangs?key=<SETUP_KEY>
// - Pour voir ce qui changerait sans rien toucher : ajouter &simulation=1
//
// Vote du jour (lib/vote.js) : /api/rangs?vote=1 (la page d'accueil) et /api/rangs?vote=tick (cron de 21 h).
// Il passe par ici parce que le site est au maximum de 12 fonctions sur l'offre gratuite de Vercel.

import { env, json, optEnv } from "../lib/discord.js";
import { mettreAJourRangs } from "../lib/rangs.js";
import { voteGET, votePOST } from "../lib/vote.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("vote")) return voteGET(req);

  const cron = optEnv("CRON_SECRET");
  const parCron = !!cron && req.headers.get("authorization") === `Bearer ${cron}`;
  const parCle = url.searchParams.get("key") === env("SETUP_KEY");
  if (!parCron && !parCle) return json({ error: "Clé invalide" }, 403);
  try {
    const rapport = await mettreAJourRangs({ simulation: url.searchParams.get("simulation") === "1" });
    return json({ ok: true, ...rapport }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

export async function POST(req) {
  if (new URL(req.url).searchParams.has("vote")) return votePOST(req);
  return json({ error: "Méthode non autorisée" }, 405);
}
