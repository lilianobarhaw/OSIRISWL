// Met à jour les rangs des Mécènes (lib/rangs.js).
// - Chaque nuit, automatiquement : Vercel appelle cette adresse (vercel.json → crons) avec la variable CRON_SECRET.
// - À la main : https://<ton-site>/api/rangs?key=<SETUP_KEY>
// - Pour voir ce qui changerait sans rien toucher : ajouter &simulation=1

import { env, json, optEnv } from "../lib/discord.js";
import { mettreAJourRangs } from "../lib/rangs.js";

export async function GET(req) {
  const url = new URL(req.url);
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
