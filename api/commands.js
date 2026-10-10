// Envoie la liste des commandes slash à Discord (à ouvrir une fois, puis après chaque changement) :
//   https://<ton-site>/api/commands?key=<SETUP_KEY>
// Et, avec &channel=<identifiant du salon d'aide>, publie le message « Créer un ticket » dans ce salon
// (comme la commande /aide-panneau). L'ancienne adresse /api/panel renvoie ici (vercel.json).

import { env, json, bot } from "../lib/discord.js";
import { COMMANDS } from "../lib/commandes.js";
import { panelMessage } from "../lib/aide.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== env("SETUP_KEY")) return json({ error: "Clé invalide" }, 403);

  if (url.searchParams.has("channel")) {
    const channel = (url.searchParams.get("channel") || "").trim();
    if (!/^\d{17,20}$/.test(channel)) return json({ error: "Ajoute &channel=<identifiant du salon d'aide>" }, 400);
    const res = await bot(`/channels/${channel}/messages`, { method: "POST", body: JSON.stringify(panelMessage()) });
    if (!res.ok) {
      let why = "";
      try { why = (await res.json()).message || ""; } catch {}
      return json({ error: `Discord a refusé (code ${res.status}${why ? " : " + why : ""}). Le bot doit pouvoir voir et écrire dans ce salon.` }, 502);
    }
    return json({ ok: true, message: "Le panneau d'aide est publié dans le salon." });
  }

  const res = await bot(`/applications/${env("DISCORD_CLIENT_ID")}/guilds/${env("DISCORD_GUILD_ID")}/commands`, {
    method: "PUT",
    body: JSON.stringify(COMMANDS),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) return json({ error: `Discord a refusé (code ${res.status})`, detail: data }, 502);
  return json({ ok: true, commandes: data.map((c) => "/" + c.name) });
}
