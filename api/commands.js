// Envoie la liste des commandes slash à Discord (à ouvrir une fois, puis après chaque changement) :
//   https://<ton-site>/api/commands?key=<SETUP_KEY>

import { env, json, bot } from "../lib/discord.js";
import { COMMANDS } from "../lib/commandes.js";

export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== env("SETUP_KEY")) return json({ error: "Clé invalide" }, 403);
  const res = await bot(`/applications/${env("DISCORD_CLIENT_ID")}/guilds/${env("DISCORD_GUILD_ID")}/commands`, {
    method: "PUT",
    body: JSON.stringify(COMMANDS),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) return json({ error: `Discord a refusé (code ${res.status})`, detail: data }, 502);
  return json({ ok: true, commandes: data.map((c) => "/" + c.name) });
}
