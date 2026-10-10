// Les Mécènes et la communauté : rangs des Mécènes, mot du jour, et le décompte de l'ouverture.
//
// Rangs (lib/rangs.js)
// - Chaque nuit, automatiquement : Vercel appelle cette adresse (vercel.json → crons) avec la variable CRON_SECRET.
// - À la main : https://<ton-site>/api/rangs?key=<SETUP_KEY>
// - Pour voir ce qui changerait sans rien toucher : ajouter &simulation=1
//
// Mot du jour (lib/mot.js) : /api/rangs?mot=1 (la page /mot).
// Cron de 21 h : /api/rangs?tick=1 → l'annonce du mot de la veille, et le salon du décompte (lib/decompte.js).
// Le cron de la nuit renomme aussi le salon du décompte.
// Ils passent par ici parce que le site est au maximum de 12 fonctions sur l'offre gratuite de Vercel.

import { env, json, optEnv } from "../lib/discord.js";
import { mettreAJourRangs } from "../lib/rangs.js";
import { motGET, motPOST, publierMot } from "../lib/mot.js";
import { majSalon } from "../lib/decompte.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.has("mot")) return motGET(req);
  if (url.searchParams.has("tick")) {
    const mot = await publierMot().catch((e) => ({ annonce: false, erreur: e.message }));
    const decompte = await majSalon().catch((e) => ({ erreur: e.message }));
    return json({ ok: true, mot, decompte }, 200, { "Cache-Control": "no-store" });
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
  return json({ error: "Méthode non autorisée" }, 405);
}
