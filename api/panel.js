// Publie le message « Créer un ticket » dans le salon d'aide.
// À ouvrir une seule fois dans le navigateur :
//   https://<ton-site>/api/panel?key=<SETUP_KEY>&channel=<identifiant du salon d'aide>

import { env, json, bot } from "../lib/discord.js";
import { panelMessage } from "../lib/aide.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== env("SETUP_KEY")) return json({ error: "Clé invalide" }, 403);
  const channel = (url.searchParams.get("channel") || "").trim();
  if (!/^\d{17,20}$/.test(channel)) return json({ error: "Ajoute &channel=<identifiant du salon d'aide>" }, 400);

  const res = await bot(`/channels/${channel}/messages`, {
    method: "POST",
    body: JSON.stringify(panelMessage()),
  });
  if (!res.ok) {
    let why = "";
    try { why = (await res.json()).message || ""; } catch {}
    return json({ error: `Discord a refusé (code ${res.status}${why ? " : " + why : ""}). Le bot doit pouvoir voir et écrire dans ce salon.` }, 502);
  }
  return json({ ok: true, message: "Le panneau d'aide est publié dans le salon." });
}
